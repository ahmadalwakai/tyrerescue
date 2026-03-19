import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  tyreProducts,
  chatSessions,
  bookings,
  callMeBack,
  contactMessages,
  notifications,
  adminChatSettings,
} from '@/lib/db/schema';
import { eq, and, sql, gte, desc } from 'drizzle-orm';
import { z } from 'zod';
import { askGroq } from '@/lib/groq';
import { adjustStock } from '@/lib/inventory/stock-service';

/* ────────── Zod schemas ────────── */

const confirmItemSchema = z.object({
  productId: z.string().uuid(),
  newStock: z.number().int().min(0),
  quantitySold: z.number().int().min(1),
});

const messageSchema = z.object({
  message: z.string().max(2000),
  sessionId: z.string().uuid().nullish(),
  intent: z.enum([
    'chat',
    'greeting',
    'stock_lookup',
    'stock_summary',
    'stock_update',
    'stock_update_confirm',
    'booking_query',
    'alerts',
    'help',
  ]).default('chat'),
  payload: z.object({ items: z.array(confirmItemSchema).min(1).max(50) }).optional(),
});

/* ────────── Types ────────── */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: ChatAction[];
}

interface ChatAction {
  type: string;
  items?: StockPreviewItem[];
  data?: Record<string, unknown>;
}

interface StockPreviewItem {
  productId: string;
  display: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  currentStock: number;
  quantitySold: number;
  newStock: number;
}

/* ────────── Helpers ────────── */

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse "sold N of WWW/AA/RXX" patterns from a free-form message */
function parseSaleItems(text: string): { quantity: number; width: number; aspect: number; rim: number }[] {
  const items: { quantity: number; width: number; aspect: number; rim: number }[] = [];
  // Match patterns like "sold 2 of 205/55/R16", "2x 205/55/R16", "205/55/R16 x2", "2 205/55/R16"
  const patterns = [
    /(?:sold\s+)?(\d+)\s*(?:x\s*|of\s+)?(\d{3})\/(\d{2})\/R(\d{2})/gi,
    /(\d{3})\/(\d{2})\/R(\d{2})\s*(?:x|×)\s*(\d+)/gi,
  ];

  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (patterns.indexOf(regex) === 1) {
        // Second pattern: size comes first, then quantity
        items.push({
          quantity: Number(m[4]),
          width: Number(m[1]),
          aspect: Number(m[2]),
          rim: Number(m[3]),
        });
      } else {
        items.push({
          quantity: Number(m[1]),
          width: Number(m[2]),
          aspect: Number(m[3]),
          rim: Number(m[4]),
        });
      }
    }
  }

  // Deduplicate same sizes — sum quantities
  const map = new Map<string, { quantity: number; width: number; aspect: number; rim: number }>();
  for (const item of items) {
    const key = `${item.width}/${item.aspect}/${item.rim}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }

  return Array.from(map.values());
}

/* ────────── Intent handlers ────────── */

async function handleGreeting(userId: string): Promise<{ reply: string; actions?: ChatAction[] }> {
  const today = todayStart();

  // Check if already asked today
  const [settings] = await db
    .select()
    .from(adminChatSettings)
    .where(eq(adminChatSettings.userId, userId))
    .limit(1);

  const alreadyAsked = settings?.lastAskedAt && settings.lastAskedAt >= today;
  const dailyEnabled = settings?.dailyAskEnabled !== false;

  // Fetch alert counts
  const alerts = await getAlertDigest();

  let greeting = "Mornin'! Welcome back to the admin panel.";
  const alertText = formatAlertDigest(alerts);

  if (dailyEnabled && !alreadyAsked) {
    greeting += " How many tyres did ye sell today? Just tell me the sizes and quantities.";
    // Mark as asked
    if (settings) {
      await db
        .update(adminChatSettings)
        .set({ lastAskedAt: new Date(), updatedAt: new Date() })
        .where(eq(adminChatSettings.userId, userId));
    } else {
      await db.insert(adminChatSettings).values({ userId, lastAskedAt: new Date() });
    }
  }

  if (alertText) {
    greeting += '\n\n' + alertText;
  }

  return { reply: greeting };
}

async function handleStockLookup(message: string): Promise<{ reply: string }> {
  const sizeMatch = message.match(/(\d{3})\/(\d{2})\/R(\d{2})/i);
  if (!sizeMatch) {
    return { reply: "Could ye give me a tyre size? Like 205/55/R16." };
  }

  const width = Number(sizeMatch[1]);
  const aspect = Number(sizeMatch[2]);
  const rim = Number(sizeMatch[3]);

  const products = await db
    .select({
      id: tyreProducts.id,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      stockNew: tyreProducts.stockNew,
      isLocalStock: tyreProducts.isLocalStock,
      priceNew: tyreProducts.priceNew,
    })
    .from(tyreProducts)
    .where(
      and(
        eq(tyreProducts.width, width),
        eq(tyreProducts.aspect, aspect),
        eq(tyreProducts.rim, rim),
        eq(tyreProducts.availableNew, true),
      )
    );

  if (products.length === 0) {
    return { reply: `No products found for ${width}/${aspect}/R${rim}.` };
  }

  const lines = products.map(
    (p) =>
      `• ${p.brand} ${p.pattern} — ${p.stockNew ?? 0} in stock${p.isLocalStock ? ' (local)' : ' (pre-order)'} — £${p.priceNew ?? '?'}`
  );

  return {
    reply: `Stock for ${width}/${aspect}/R${rim}:\n${lines.join('\n')}`,
  };
}

async function handleStockSummary(): Promise<{ reply: string }> {
  const [result] = await db
    .select({
      totalProducts: sql<number>`count(*)::int`,
      totalStock: sql<number>`coalesce(sum(${tyreProducts.stockNew}), 0)::int`,
      localStock: sql<number>`coalesce(sum(case when ${tyreProducts.isLocalStock} = true then ${tyreProducts.stockNew} else 0 end), 0)::int`,
      lowStockCount: sql<number>`count(case when ${tyreProducts.stockNew} > 0 and ${tyreProducts.stockNew} <= 2 and ${tyreProducts.isLocalStock} = true then 1 end)::int`,
    })
    .from(tyreProducts)
    .where(eq(tyreProducts.availableNew, true));

  return {
    reply: `Inventory summary:\n• Total products: ${result.totalProducts}\n• Total tyres in stock: ${result.totalStock}\n• Local stock: ${result.localStock}\n• Low stock alerts (≤2): ${result.lowStockCount}`,
  };
}

async function handleStockUpdate(message: string): Promise<{ reply: string; actions?: ChatAction[] }> {
  const parsed = parseSaleItems(message);

  if (parsed.length === 0) {
    return {
      reply: "I couldn't parse any tyre sales from that. Try something like:\n\"sold 2 of 205/55/R16 and 1 of 225/45/R18\"",
    };
  }

  const allItems: StockPreviewItem[] = [];
  const errors: string[] = [];

  for (const item of parsed) {
    const products = await db
      .select({
        id: tyreProducts.id,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay,
        stockNew: tyreProducts.stockNew,
        isLocalStock: tyreProducts.isLocalStock,
      })
      .from(tyreProducts)
      .where(
        and(
          eq(tyreProducts.width, item.width),
          eq(tyreProducts.aspect, item.aspect),
          eq(tyreProducts.rim, item.rim),
          eq(tyreProducts.availableNew, true),
          eq(tyreProducts.isLocalStock, true),
        )
      );

    if (products.length === 0) {
      errors.push(`No local stock found for ${item.width}/${item.aspect}/R${item.rim}`);
      continue;
    }

    for (const p of products) {
      const current = p.stockNew ?? 0;
      const newStock = Math.max(0, current - item.quantity);
      allItems.push({
        productId: p.id,
        display: `${p.brand} ${p.pattern} ${p.sizeDisplay}`,
        brand: p.brand,
        pattern: p.pattern,
        sizeDisplay: p.sizeDisplay,
        currentStock: current,
        quantitySold: item.quantity,
        newStock,
      });
    }
  }

  if (allItems.length === 0) {
    return { reply: errors.join('\n') || "No matching products found." };
  }

  let reply = "Here's what I found. **Select the products to update**, then confirm:\n";
  if (errors.length > 0) {
    reply += '\n⚠️ ' + errors.join('\n⚠️ ') + '\n';
  }

  return {
    reply,
    actions: [{ type: 'stock_update_preview', items: allItems }],
  };
}

async function handleStockUpdateConfirm(
  payload: { items: { productId: string; newStock: number; quantitySold: number }[] },
  userId: string
): Promise<{ reply: string }> {
  const results: string[] = [];
  const errors: string[] = [];

  for (const item of payload.items) {
    // Re-fetch current stock to recompute from live data (prevents stale writes)
    const [current] = await db
      .select({ stockNew: tyreProducts.stockNew, brand: tyreProducts.brand, sizeDisplay: tyreProducts.sizeDisplay })
      .from(tyreProducts)
      .where(eq(tyreProducts.id, item.productId))
      .limit(1);

    if (!current) {
      errors.push(`Product ${item.productId} not found`);
      continue;
    }

    // Recompute newStock from live DB value, not stale client value
    const liveStock = current.stockNew ?? 0;
    const computedNewStock = Math.max(0, liveStock - item.quantitySold);

    try {
      const result = await adjustStock({
        productId: item.productId,
        newStock: computedNewStock,
        reason: 'manual-edit',
        actor: 'admin',
        actorUserId: userId,
        note: `Chatbot sale: -${item.quantitySold} (${current.brand} ${current.sizeDisplay})`,
      });
      if (result.success) {
        results.push(`${current.brand} ${current.sizeDisplay}: ${liveStock} → ${result.stockAfter}`);
      } else {
        errors.push(`Failed to update ${current.brand} ${current.sizeDisplay}: ${result.error}`);
      }
    } catch (err) {
      errors.push(`Failed to update ${current.brand} ${current.sizeDisplay}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  let reply = '';
  if (results.length > 0) {
    reply += `Aye, stock updated!\n${results.map((r) => `✅ ${r}`).join('\n')}`;
  }
  if (errors.length > 0) {
    reply += `\n${errors.map((e) => `❌ ${e}`).join('\n')}`;
  }

  return { reply: reply || 'No changes made.' };
}

async function handleBookingQuery(): Promise<{ reply: string }> {
  const today = todayStart();
  const todayBookings = await db
    .select({
      refNumber: bookings.refNumber,
      customerName: bookings.customerName,
      status: bookings.status,
      bookingType: bookings.bookingType,
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      scheduledAt: bookings.scheduledAt,
      totalAmount: bookings.totalAmount,
    })
    .from(bookings)
    .where(gte(bookings.createdAt, today))
    .orderBy(desc(bookings.createdAt))
    .limit(10);

  if (todayBookings.length === 0) {
    return { reply: "No bookings today yet." };
  }

  const lines = todayBookings.map(
    (b) =>
      `• ${b.refNumber} — ${b.customerName} — ${b.status} — ${b.bookingType} — ${b.tyreSizeDisplay ?? 'N/A'} — £${b.totalAmount}`
  );

  return { reply: `Today's bookings (${todayBookings.length}):\n${lines.join('\n')}` };
}

async function getAlertDigest() {
  const today = todayStart();

  const [newBookingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(gte(bookings.createdAt, today));

  const [pendingCallbacks] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callMeBack)
    .where(eq(callMeBack.status, 'pending'));

  const [newMessages] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactMessages)
    .where(eq(contactMessages.status, 'unread'));

  const [pendingNotifs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.status, 'pending'));

  return {
    bookings: newBookingCount.count,
    callbacks: pendingCallbacks.count,
    messages: newMessages.count,
    notifications: pendingNotifs.count,
  };
}

function formatAlertDigest(alerts: { bookings: number; callbacks: number; messages: number; notifications: number }): string {
  const parts: string[] = [];
  if (alerts.bookings > 0) parts.push(`📋 ${alerts.bookings} new booking${alerts.bookings > 1 ? 's' : ''} today`);
  if (alerts.callbacks > 0) parts.push(`📞 ${alerts.callbacks} pending callback${alerts.callbacks > 1 ? 's' : ''}`);
  if (alerts.messages > 0) parts.push(`✉️ ${alerts.messages} unread message${alerts.messages > 1 ? 's' : ''}`);
  if (alerts.notifications > 0) parts.push(`🔔 ${alerts.notifications} pending notification${alerts.notifications > 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join('\n') : '';
}

async function handleAlerts(): Promise<{ reply: string }> {
  const alerts = await getAlertDigest();
  const text = formatAlertDigest(alerts);
  return { reply: text || "All clear — no pending alerts." };
}

async function handleHelp(message: string): Promise<{ reply: string }> {
  const systemPrompt = `You are an admin assistant for Tyre Rescue, a mobile tyre fitting business in Glasgow/Edinburgh, Scotland.
You help the admin with operational questions about the admin panel.
Available admin features: Bookings, Callbacks, Messages, Drivers, Inventory, Pricing, Availability, Testimonials, FAQ, Content, Cookies, Audit Log, Analytics.
Booking statuses: draft → pricing_ready → awaiting_payment → paid → driver_assigned → en_route → arrived → in_progress → completed. Cancellation paths also exist.
Stock is managed via the Inventory page — products can be activated from the catalogue, prices/stock edited inline, and stock imported from Excel.
Keep answers concise and practical. The admin is non-technical.`;

  const reply = await askGroq(systemPrompt, message, 400);
  return { reply: reply || "I'm having trouble reaching the AI right now. Try asking about stock, bookings, or alerts instead." };
}

/* ────────── Session persistence ────────── */

async function getOrCreateSession(userId: string, sessionId?: string): Promise<{ id: string; messages: ChatMessage[] }> {
  if (sessionId) {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .limit(1);
    if (session) {
      return { id: session.id, messages: (session.messages as ChatMessage[]) || [] };
    }
  }

  // Check for today's session
  const today = todayStart();
  const [existing] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.userId, userId), gte(chatSessions.createdAt, today)))
    .orderBy(desc(chatSessions.createdAt))
    .limit(1);

  if (existing) {
    return { id: existing.id, messages: (existing.messages as ChatMessage[]) || [] };
  }

  // Create new
  const [created] = await db
    .insert(chatSessions)
    .values({ userId, messages: [] })
    .returning({ id: chatSessions.id });

  return { id: created.id, messages: [] };
}

async function appendMessages(sessionId: string, messages: ChatMessage[]) {
  await db
    .update(chatSessions)
    .set({ messages: JSON.parse(JSON.stringify(messages)), updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId));
}

/* ────────── Main handler ────────── */

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { message, sessionId, intent, payload } = parsed.data;
  const userId = session.user.id;

  // Get or create session
  const chatSession = await getOrCreateSession(userId, sessionId ?? undefined);
  const now = new Date().toISOString();

  // Add user message (except greeting and alerts which have no meaningful user message)
  if (intent !== 'greeting' && message.length > 0) {
    chatSession.messages.push({ role: 'user', content: message, timestamp: now });
  }

  let result: { reply: string; actions?: ChatAction[] };

  // Creator identity — hard-coded, no AI
  if (/who(?:'?s?)\s*(created?|made|built|developed|makes?|builds?)\s+you|who(?:'s|\s+is)\s+your\s+(creator|developer|maker|builder)|your\s+(creator|developer|maker)|create(?:d)?\s+you/i.test(message)) {
    result = { reply: 'Mr Ahmad Alwakai lead developer' };
  }
  // Deterministic intent routing
  else if (intent === 'greeting') {
    result = await handleGreeting(userId);
  } else if (intent === 'stock_lookup' || /check\s+stock|stock\s+for|availability\s+(?:of|for)/i.test(message)) {
    result = await handleStockLookup(message);
  } else if (intent === 'stock_summary' || /how\s+many\s+tyr|total\s+stock|left\s+in|inventory\s+summary/i.test(message)) {
    result = await handleStockSummary();
  } else if (intent === 'stock_update') {
    result = await handleStockUpdate(message);
  } else if (intent === 'stock_update_confirm') {
    if (!payload?.items?.length) {
      result = { reply: 'No items to update.' };
    } else {
      result = await handleStockUpdateConfirm(payload, userId);
      // Mark daily question as answered
      await db
        .update(adminChatSettings)
        .set({ lastAnsweredAt: new Date(), updatedAt: new Date() })
        .where(eq(adminChatSettings.userId, userId));
    }
  } else if (intent === 'booking_query' || /new\s+booking|recent\s+booking|today.*booking/i.test(message)) {
    result = await handleBookingQuery();
  } else if (intent === 'alerts' || /notification|alert|callback|pending/i.test(message)) {
    result = await handleAlerts();
  } else if (/sold\s+\d|^\d+\s*(?:x\s*)?\d{3}\/\d{2}\/R\d{2}/i.test(message)) {
    // Detect sale message even without explicit intent
    result = await handleStockUpdate(message);
  } else {
    // Fallback to AI guidance
    result = await handleHelp(message);
  }

  // Store assistant reply
  chatSession.messages.push({
    role: 'assistant',
    content: result.reply,
    timestamp: new Date().toISOString(),
    actions: result.actions,
  });

  // Persist (keep last 100 messages per session)
  const trimmed = chatSession.messages.slice(-100);
  await appendMessages(chatSession.id, trimmed);

  return NextResponse.json({
    reply: result.reply,
    actions: result.actions || [],
    sessionId: chatSession.id,
  });
}
