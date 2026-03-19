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
import { askGroq } from '@/lib/groq';
import {
  generatePlan,
  executePlan,
  planRequiresConfirmation,
  createPendingConfirmation,
  validateConfirmation,
  buildConfirmationDetails,
  buildResponsePrompt,
  IDENTITY_RESPONSE,
  toolMap,
} from '@/lib/ai/admin-agent';
import { agentRequestSchema } from '@/lib/ai/admin-agent/schemas';
import { adjustStock } from '@/lib/inventory/stock-service';
import type {
  ChatMessage,
  AgentAction,
  AgentSessionContext,
  StockPreviewItem,
  ToolContext,
} from '@/lib/ai/admin-agent/types';

/* ────────── Helpers ────────── */

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ────────── Legacy stock update preview (preserved for existing UI) ────────── */

function parseSaleItems(text: string): { quantity: number; width: number; aspect: number; rim: number }[] {
  const items: { quantity: number; width: number; aspect: number; rim: number }[] = [];
  const patterns = [
    /(?:sold\s+)?(\d+)\s*(?:x\s*|of\s+)?(\d{3})\/(\d{2})\/R(\d{2})/gi,
    /(\d{3})\/(\d{2})\/R(\d{2})\s*(?:x|×)\s*(\d+)/gi,
  ];
  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (patterns.indexOf(regex) === 1) {
        items.push({ quantity: Number(m[4]), width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) });
      } else {
        items.push({ quantity: Number(m[1]), width: Number(m[2]), aspect: Number(m[3]), rim: Number(m[4]) });
      }
    }
  }
  const map = new Map<string, { quantity: number; width: number; aspect: number; rim: number }>();
  for (const item of items) {
    const key = `${item.width}/${item.aspect}/${item.rim}`;
    const existing = map.get(key);
    if (existing) existing.quantity += item.quantity;
    else map.set(key, { ...item });
  }
  return Array.from(map.values());
}

async function handleStockUpdatePreview(message: string): Promise<{ reply: string; actions?: AgentAction[] }> {
  const parsed = parseSaleItems(message);
  if (parsed.length === 0) {
    return { reply: "I couldn't parse any tyre sales from that. Try something like:\n\"sold 2 of 205/55/R16 and 1 of 225/45/R18\"" };
  }
  const allItems: StockPreviewItem[] = [];
  const errors: string[] = [];
  for (const item of parsed) {
    const products = await db
      .select({
        id: tyreProducts.id, brand: tyreProducts.brand, pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay, stockNew: tyreProducts.stockNew, isLocalStock: tyreProducts.isLocalStock,
      })
      .from(tyreProducts)
      .where(and(
        eq(tyreProducts.width, item.width), eq(tyreProducts.aspect, item.aspect),
        eq(tyreProducts.rim, item.rim), eq(tyreProducts.availableNew, true), eq(tyreProducts.isLocalStock, true),
      ));
    if (products.length === 0) { errors.push(`No local stock found for ${item.width}/${item.aspect}/R${item.rim}`); continue; }
    for (const p of products) {
      const current = p.stockNew ?? 0;
      allItems.push({
        productId: p.id, display: `${p.brand} ${p.pattern} ${p.sizeDisplay}`,
        brand: p.brand, pattern: p.pattern, sizeDisplay: p.sizeDisplay,
        currentStock: current, quantitySold: item.quantity, newStock: Math.max(0, current - item.quantity),
      });
    }
  }
  if (allItems.length === 0) return { reply: errors.join('\n') || 'No matching products found.' };
  let reply = "Here's what I found. **Select the products to update**, then confirm:\n";
  if (errors.length > 0) reply += '\n' + errors.join('\n') + '\n';
  return { reply, actions: [{ type: 'stock_update_preview', items: allItems }] };
}

async function handleStockUpdateConfirm(
  payload: { items: { productId: string; newStock: number; quantitySold: number }[] },
  userId: string,
): Promise<{ reply: string }> {
  const results: string[] = [];
  const errors: string[] = [];
  for (const item of payload.items) {
    const [current] = await db
      .select({ stockNew: tyreProducts.stockNew, brand: tyreProducts.brand, sizeDisplay: tyreProducts.sizeDisplay })
      .from(tyreProducts).where(eq(tyreProducts.id, item.productId)).limit(1);
    if (!current) { errors.push(`Product ${item.productId} not found`); continue; }
    const liveStock = current.stockNew ?? 0;
    const computedNewStock = Math.max(0, liveStock - item.quantitySold);
    try {
      const result = await adjustStock({
        productId: item.productId, newStock: computedNewStock, reason: 'manual-edit',
        actor: 'admin', actorUserId: userId, note: `Chatbot sale: -${item.quantitySold} (${current.brand} ${current.sizeDisplay})`,
      });
      if (result.success) results.push(`${current.brand} ${current.sizeDisplay}: ${liveStock} → ${result.stockAfter}`);
      else errors.push(`Failed to update ${current.brand} ${current.sizeDisplay}: ${result.error}`);
    } catch (err) {
      errors.push(`Failed to update ${current.brand} ${current.sizeDisplay}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }
  let reply = '';
  if (results.length > 0) reply += `Aye, stock updated!\n${results.map((r) => `${r}`).join('\n')}`;
  if (errors.length > 0) reply += `\n${errors.map((e) => `Error: ${e}`).join('\n')}`;
  return { reply: reply || 'No changes made.' };
}

/* ────────── Greeting handler (preserved) ────────── */

async function handleGreeting(userId: string): Promise<{ reply: string }> {
  const today = todayStart();
  const [settings] = await db.select().from(adminChatSettings).where(eq(adminChatSettings.userId, userId)).limit(1);
  const alreadyAsked = settings?.lastAskedAt && settings.lastAskedAt >= today;
  const dailyEnabled = settings?.dailyAskEnabled !== false;

  // Alert counts
  const [bk] = await db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(gte(bookings.createdAt, today));
  const [cb] = await db.select({ count: sql<number>`count(*)::int` }).from(callMeBack).where(eq(callMeBack.status, 'pending'));
  const [msg] = await db.select({ count: sql<number>`count(*)::int` }).from(contactMessages).where(eq(contactMessages.status, 'unread'));
  const [notif] = await db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(eq(notifications.status, 'pending'));

  let greeting = "Mornin'! Welcome back to the admin panel.";
  if (dailyEnabled && !alreadyAsked) {
    greeting += " How many tyres did ye sell today? Just tell me the sizes and quantities.";
    if (settings) {
      await db.update(adminChatSettings).set({ lastAskedAt: new Date(), updatedAt: new Date() }).where(eq(adminChatSettings.userId, userId));
    } else {
      await db.insert(adminChatSettings).values({ userId, lastAskedAt: new Date() });
    }
  }
  const parts: string[] = [];
  if (bk.count > 0) parts.push(`${bk.count} new booking${bk.count > 1 ? 's' : ''} today`);
  if (cb.count > 0) parts.push(`${cb.count} pending callback${cb.count > 1 ? 's' : ''}`);
  if (msg.count > 0) parts.push(`${msg.count} unread message${msg.count > 1 ? 's' : ''}`);
  if (notif.count > 0) parts.push(`${notif.count} pending notification${notif.count > 1 ? 's' : ''}`);
  if (parts.length > 0) greeting += '\n\n' + parts.join('\n');

  return { reply: greeting };
}

/* ────────── Session persistence ────────── */

type SessionData = { id: string; messages: ChatMessage[]; context?: AgentSessionContext };

async function getOrCreateSession(userId: string, sessionId?: string): Promise<SessionData> {
  if (sessionId) {
    const [session] = await db.select().from(chatSessions).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId))).limit(1);
    if (session) {
      return {
        id: session.id,
        messages: (session.messages as ChatMessage[]) || [],
        context: (session as Record<string, unknown>).context as AgentSessionContext | undefined,
      };
    }
  }
  const today = todayStart();
  const [existing] = await db.select().from(chatSessions).where(and(eq(chatSessions.userId, userId), gte(chatSessions.createdAt, today))).orderBy(desc(chatSessions.createdAt)).limit(1);
  if (existing) {
    return {
      id: existing.id,
      messages: (existing.messages as ChatMessage[]) || [],
      context: (existing as Record<string, unknown>).context as AgentSessionContext | undefined,
    };
  }
  const [created] = await db.insert(chatSessions).values({ userId, messages: [] }).returning({ id: chatSessions.id });
  return { id: created.id, messages: [], context: undefined };
}

async function persistSession(session: SessionData) {
  const trimmed = session.messages.slice(-100);
  await db.update(chatSessions).set({
    messages: JSON.parse(JSON.stringify(trimmed)),
    updatedAt: new Date(),
  }).where(eq(chatSessions.id, session.id));
}

/* ────────── Response formatting via LLM ────────── */

async function formatAgentResponse(intent: string, toolResults: { toolName: string; result: { success: boolean; data?: unknown; error?: string } }[]): Promise<string> {
  // Build a summary of what happened
  const resultSummary = toolResults.map((r) => {
    if (r.result.success) {
      return `Tool ${r.toolName} succeeded. Data: ${JSON.stringify(r.result.data)}`;
    }
    return `Tool ${r.toolName} failed: ${r.result.error}`;
  }).join('\n');

  try {
    const reply = await askGroq(
      buildResponsePrompt(),
      `Intent: ${intent}\nResults:\n${resultSummary}`,
      500,
    );
    if (reply) return reply;
  } catch { /* fall through */ }

  // Fallback: format without LLM
  return toolResults.map((r) => {
    if (r.result.success && r.result.data) {
      const data = r.result.data;
      if (Array.isArray(data)) {
        if (data.length === 0) return 'No results found.';
        return `Found ${data.length} item(s):\n` + data.slice(0, 10).map((item: Record<string, unknown>) =>
          Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(' | ')
        ).join('\n');
      }
      return Object.entries(data as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join('\n');
    }
    if (!r.result.success) return `Error: ${r.result.error}`;
    return 'Done.';
  }).join('\n\n');
}

/* ────────── Main handler ────────── */

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = agentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { message, sessionId, intent, payload, confirmationId } = parsed.data;
  const userId = session.user.id;
  const chatSession = await getOrCreateSession(userId, sessionId ?? undefined);
  const now = new Date().toISOString();

  const ctx: ToolContext = { userId, userRole: 'admin' };

  // Add user message
  if (intent !== 'greeting' && message.length > 0) {
    chatSession.messages.push({ role: 'user', content: message, timestamp: now });
  }

  let reply: string;
  let actions: AgentAction[] = [];

  // ── 1. Handle legacy intents for backward compatibility ──

  if (intent === 'greeting') {
    const result = await handleGreeting(userId);
    reply = result.reply;
  }

  else if (intent === 'stock_update_confirm') {
    // Legacy stock update confirm from existing UI
    if (!payload?.items?.length) {
      reply = 'No items to update.';
    } else {
      const result = await handleStockUpdateConfirm(payload, userId);
      reply = result.reply;
      await db.update(adminChatSettings).set({ lastAnsweredAt: new Date(), updatedAt: new Date() }).where(eq(adminChatSettings.userId, userId));
    }
  }

  else if (intent === 'stock_update') {
    // Legacy: show stock update preview with selectable products
    const result = await handleStockUpdatePreview(message);
    reply = result.reply;
    if (result.actions) actions = result.actions;
  }

  // ── 2. Handle new agent confirmation flow ──

  else if (intent === 'confirm_action' && confirmationId) {
    const validation = validateConfirmation(chatSession.context, confirmationId);
    if (!validation.valid) {
      reply = validation.error!;
      actions = [{ type: 'error', message: validation.error! }];
    } else {
      // Execute the confirmed plan
      const output = await executePlan(validation.plan!, ctx);
      chatSession.context = { ...chatSession.context, pendingConfirmation: null, lastToolResults: output.results.map((r) => ({ toolName: r.toolName, result: r.result, at: now })) };
      reply = await formatAgentResponse(validation.plan!.intent, output.results);
      if (output.cards.length > 0) actions = [{ type: 'executed', results: output.cards }];
    }
  }

  else if (intent === 'cancel_action') {
    chatSession.context = { ...chatSession.context, pendingConfirmation: null };
    reply = 'Action cancelled.';
  }

  // ── 3. Auto-detect sale pattern (legacy compat) ──

  else if (/sold\s+\d|^\d+\s*(?:x\s*)?\d{3}\/\d{2}\/R\d{2}/i.test(message)) {
    const result = await handleStockUpdatePreview(message);
    reply = result.reply;
    if (result.actions) actions = result.actions;
  }

  // ── 4. Agent pipeline: plan → validate → confirm/execute → respond ──

  else {
    // Identity check — hard-coded, no AI
    if (/who(?:'?s?)\s*(created?|made|built|developed|makes?|builds?)\s+you|who(?:'s|\s+is)\s+your\s+(creator|developer|maker|builder)|your\s+(creator|developer|maker)|create(?:d)?\s+you/i.test(message)) {
      reply = IDENTITY_RESPONSE;
    }

    else {
      // Generate plan (deterministic first, then LLM fallback)
      const plan = await generatePlan(message);

      if (plan.intent === 'identity') {
        reply = IDENTITY_RESPONSE;
      }

      else if (plan.tools.length === 0) {
        // No tools matched — use LLM for general help
        if (plan.clarificationNeeded) {
          reply = plan.clarificationNeeded;
        } else {
          const systemPrompt = `You are an admin assistant for Tyre Rescue, a mobile tyre fitting business in Glasgow/Edinburgh, Scotland.
You help the admin with operational questions about the admin panel.
Available features: Bookings, Callbacks, Messages, Drivers, Inventory, Pricing, Availability, Testimonials, FAQ, Content, Audit Log, Analytics.
Keep answers concise and practical. The admin is non-technical.
For identity questions, answer exactly: "Mr Ahmad Alwakai lead developer"`;
          const helpReply = await askGroq(systemPrompt, message, 400);
          reply = helpReply || "I'm having trouble right now. Try asking about stock, bookings, or alerts instead.";
        }
      }

      else if (plan.clarificationNeeded && plan.tools.length > 0 && plan.tools.every((t) => toolMap.get(t.toolName)?.kind === 'read')) {
        // Has clarification but tools are read-only — execute them to show context, then ask
        const output = await executePlan(plan, ctx);
        chatSession.context = { ...chatSession.context, lastToolResults: output.results.map((r) => ({ toolName: r.toolName, result: r.result, at: now })) };
        reply = await formatAgentResponse(plan.intent, output.results);
        if (plan.clarificationNeeded) reply += '\n\n' + plan.clarificationNeeded;
      }

      else if (planRequiresConfirmation(plan)) {
        // Write tools need confirmation
        const summary = plan.tools.map((t) => {
          const def = toolMap.get(t.toolName);
          const paramStr = Object.entries(t.params).map(([k, v]) => `${k}: ${v}`).join(', ');
          return `${def?.description ?? t.toolName} (${paramStr})`;
        }).join('\n');

        const pending = createPendingConfirmation(plan, summary);
        chatSession.context = { ...chatSession.context, pendingConfirmation: pending };
        const details = buildConfirmationDetails(plan);
        reply = `I'll do the following — please confirm:\n${summary}`;
        actions = [{ type: 'confirmation_required', confirmationId: pending.id, summary, details }];
      }

      else {
        // Read-only tools — execute immediately
        const output = await executePlan(plan, ctx);
        chatSession.context = {
          ...chatSession.context,
          lastToolResults: output.results.map((r) => ({ toolName: r.toolName, result: r.result, at: now })),
          lastEntities: extractEntities(output.results),
        };
        reply = await formatAgentResponse(plan.intent, output.results);
        if (output.cards.some((c) => !c.success)) {
          actions = output.cards.filter((c) => !c.success).map((c) => ({ type: 'warning' as const, message: c.summary }));
        }
      }
    }
  }

  // Store assistant reply
  chatSession.messages.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString(), actions: actions.length > 0 ? actions : undefined });
  await persistSession(chatSession);

  return NextResponse.json({ reply, actions, sessionId: chatSession.id });
}

/* ── Entity extraction for context memory ── */
function extractEntities(results: { toolName: string; result: { success: boolean; data?: unknown } }[]): { type: string; id: string; ref?: string }[] {
  const entities: { type: string; id: string; ref?: string }[] = [];
  for (const r of results) {
    if (!r.result.success || !r.result.data) continue;
    const data = r.result.data;
    if (Array.isArray(data)) {
      for (const item of data.slice(0, 5)) {
        const d = item as Record<string, unknown>;
        if (d.id && typeof d.id === 'string') {
          entities.push({ type: r.toolName, id: d.id, ref: d.refNumber as string | undefined });
        }
      }
    } else {
      const d = data as Record<string, unknown>;
      if (d.id && typeof d.id === 'string') {
        entities.push({ type: r.toolName, id: d.id, ref: d.refNumber as string | undefined });
      }
    }
  }
  return entities;
}
