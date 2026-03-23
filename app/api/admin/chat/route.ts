import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  tyreProducts,
  chatSessions,
  adminChatSettings,
} from '@/lib/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { askGroq } from '@/lib/groq';
import {
  generatePlan,
  executePlan,
  planRequiresConfirmation,
  createPendingConfirmation,
  validateConfirmation,
  buildConfirmationDetails,
  IDENTITY_RESPONSE,
  toolMap,
  formatAgentResponse,
  recall,
  extractSessionMemory,
  buildMemoryContext,
  summarizeIfNeeded,
  rememberEntitiesFromResults,
  resolveEntities,
  injectResolvedEntities,
  ZYPHON_GREETING,
  resolveSessionLanguage,
  gatherStartupBriefing,
  formatStartupBriefing,
} from '@/lib/ai/admin-agent';
import {
  gatherStartupBriefingV2,
  formatStartupBriefingV2,
} from '@/lib/ai/admin-agent/context-builder';
import { agentRequestSchema } from '@/lib/ai/admin-agent/schemas';
import { adjustStock } from '@/lib/inventory/stock-service';
import { logAgentAction } from '@/lib/ai/admin-agent/audit';
import { classifyRisk } from '@/lib/ai/admin-agent/multi-step-planner';
import { buildRiskSummary } from '@/lib/ai/admin-agent/safeguards';
import type {
  ChatMessage,
  AgentAction,
  AgentSessionContext,
  StockPreviewItem,
  ToolContext,
  InvoicePreviewData,
  BookingPreviewData,
} from '@/lib/ai/admin-agent/types';
import type { ZyphonLanguage } from '@/lib/ai/admin-agent/language';

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

/* ────────── Greeting handler (Zyphon startup briefing) ────────── */

async function handleGreeting(userId: string): Promise<{ reply: string }> {
  const today = todayStart();
  const [settings] = await db.select().from(adminChatSettings).where(eq(adminChatSettings.userId, userId)).limit(1);

  // Gather extended startup briefing data in parallel
  const briefing = await gatherStartupBriefingV2();
  // Default language is Arabic for the greeting (before admin's first reply)
  const briefingText = formatStartupBriefingV2(briefing, 'ar');

  let greeting = ZYPHON_GREETING;
  greeting += '\n\n' + briefingText;

  // Track daily ask
  const dailyEnabled = settings?.dailyAskEnabled !== false;
  const alreadyAsked = settings?.lastAskedAt && settings.lastAskedAt >= today;
  if (dailyEnabled && !alreadyAsked) {
    greeting += '\n\nكم تاير بعت اليوم؟ كلي الاحجام والكميات';
    if (settings) {
      await db.update(adminChatSettings).set({ lastAskedAt: new Date(), updatedAt: new Date() }).where(eq(adminChatSettings.userId, userId));
    } else {
      await db.insert(adminChatSettings).values({ userId, lastAskedAt: new Date() });
    }
  }

  return { reply: greeting };
}

/* ────────── Session persistence ────────── */

type SessionData = { id: string; messages: ChatMessage[]; context?: AgentSessionContext; summary?: string | null };

async function getOrCreateSession(userId: string, sessionId?: string): Promise<SessionData> {
  if (sessionId) {
    const [session] = await db.select().from(chatSessions).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId))).limit(1);
    if (session) {
      return {
        id: session.id,
        messages: (session.messages as ChatMessage[]) || [],
        context: (session.context as AgentSessionContext | undefined) ?? undefined,
        summary: session.summary ?? null,
      };
    }
  }
  const today = todayStart();
  const [existing] = await db.select().from(chatSessions).where(and(eq(chatSessions.userId, userId), gte(chatSessions.createdAt, today))).orderBy(desc(chatSessions.createdAt)).limit(1);
  if (existing) {
    return {
      id: existing.id,
      messages: (existing.messages as ChatMessage[]) || [],
      context: (existing.context as AgentSessionContext | undefined) ?? undefined,
      summary: existing.summary ?? null,
    };
  }
  const [created] = await db.insert(chatSessions).values({ userId, messages: [] }).returning({ id: chatSessions.id });
  return { id: created.id, messages: [], context: undefined, summary: null };
}

async function persistSession(session: SessionData) {
  // Summarize older messages to prevent context bloat
  const { messages: trimmed, summary } = await summarizeIfNeeded(
    session.messages.slice(-100),
    session.summary,
  );

  await db.update(chatSessions).set({
    messages: JSON.parse(JSON.stringify(trimmed)),
    context: session.context ? JSON.parse(JSON.stringify(session.context)) : null,
    summary: summary,
    updatedAt: new Date(),
  }).where(eq(chatSessions.id, session.id));
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

  // Load memory context
  const longTermMemory = await recall(userId, { limit: 20 });
  const sessionMemory = extractSessionMemory(chatSession.context);
  const memoryContext = buildMemoryContext(longTermMemory, sessionMemory);

  // Resolve session language (Arabic/English)
  const lang: ZyphonLanguage = resolveSessionLanguage(
    chatSession.context?.lang,
    intent !== 'greeting' ? message : undefined,
  );
  // Lock language in session after admin's first real message
  if (!chatSession.context?.lang && intent !== 'greeting' && message.trim().length > 0) {
    chatSession.context = { ...chatSession.context, lang };
  }

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
      reply = await formatAgentResponse(validation.plan!.intent, output.results, memoryContext, lang);
      if (output.cards.length > 0) actions = [{ type: 'executed', results: output.cards }];

      // Phase 3: Add preview cards for invoice/booking creation
      for (const r of output.results) {
        if (r.toolName === 'create_invoice_draft' && r.result.success && r.result.data) {
          const d = r.result.data as { preview?: InvoicePreviewData };
          if (d.preview) actions.push({ type: 'invoice_preview', invoice: d.preview });
        }
        if (r.toolName === 'create_quick_booking' && r.result.success && r.result.data) {
          const d = r.result.data as { preview?: BookingPreviewData };
          if (d.preview) actions.push({ type: 'booking_preview', booking: d.preview });
        }
      }

      // Audit trail: log agent action
      const risk = classifyRisk(validation.plan!);
      await logAgentAction(userId, validation.plan!, output, risk);

      // Remember entities from results
      await rememberEntitiesFromResults(userId, output.results);
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

  // ── 4. Agent pipeline: plan → resolve → validate → confirm/execute → respond ──

  else {
    // Identity check — hard-coded, no AI
    if (/who(?:'?s?)\s*(created?|made|built|developed|makes?|builds?)\s+you|who(?:'s|\s+is)\s+your\s+(creator|developer|maker|builder)|your\s+(creator|developer|maker)|create(?:d)?\s+you/i.test(message)) {
      reply = IDENTITY_RESPONSE;
    }

    else {
      // Resolve entity references ("that booking", "the last driver", etc.)
      const resolved = await resolveEntities(message, {
        recentEntities: sessionMemory.recentEntities,
        longTermMemory,
      });

      // Generate plan (deterministic first, then LLM fallback with memory context)
      const plan = await generatePlan(message, memoryContext);

      // Inject resolved entities into plan params where needed
      for (const tool of plan.tools) {
        tool.params = injectResolvedEntities(tool.params, resolved, tool.toolName);
      }

      if (plan.intent === 'identity') {
        reply = IDENTITY_RESPONSE;
      }

      // Stock reduction/set → redirect to stock preview UI (needs product selection)
      else if (plan.intent === 'stock_reduction' || plan.intent === 'stock_set') {
        const result = await handleStockUpdatePreview(message);
        reply = result.reply;
        if (result.actions) actions = result.actions;
      }

      // Delete booking → lookup + explain deletion is not supported
      else if (plan.intent === 'delete_booking') {
        const output = await executePlan(plan, ctx);
        const lookupResult = output.results[0]?.result;
        if (lookupResult?.success) {
          const bk = lookupResult.data as Record<string, unknown>;
          reply = `Booking ${bk.refNumber} exists (status: "${bk.status}"). Bookings cannot be deleted — they can only be cancelled. To cancel, say: "cancel booking ${bk.refNumber}"`;
          await rememberEntitiesFromResults(userId, output.results);
        } else {
          reply = lookupResult?.error ?? 'Booking not found.';
          actions = [{ type: 'error', message: reply }];
        }
      }

      // Confirm booking → lookup + show valid next states
      else if (plan.intent === 'confirm_booking') {
        const output = await executePlan(plan, ctx);
        const lookupResult = output.results[0]?.result;
        if (lookupResult?.success) {
          const bk = lookupResult.data as Record<string, unknown>;
          reply = `Booking ${bk.refNumber} is currently "${bk.status}". To change its status, say: "change ${bk.refNumber} to <new-status>"\nFor example: "change ${bk.refNumber} to paid"`;
          await rememberEntitiesFromResults(userId, output.results);
        } else {
          reply = lookupResult?.error ?? 'Booking not found.';
          actions = [{ type: 'error', message: reply }];
        }
      }

      // Cancel booking → the plan already has update_booking_status with 'cancelled'
      // Falls through to the confirmation flow below since it's a write tool

      else if (plan.tools.length === 0) {
        // No tools matched — use LLM for general help
        if (plan.clarificationNeeded) {
          reply = plan.clarificationNeeded;
        } else {
          const contextBlock = memoryContext
            ? `\nRecent context:\n${memoryContext}\n`
            : '';
          const langInstruction = lang === 'ar'
            ? 'Respond in Arabic (Iraqi/Gulf dialect). Keep technical terms in English.'
            : 'Respond in English.';
          const systemPrompt = `You are Zyphon, the admin assistant for Tyre Rescue, a mobile tyre fitting business in Glasgow/Edinburgh, Scotland.
You help the admin with operational questions about the admin panel.
Available features: Bookings, Callbacks, Messages, Drivers, Inventory, Pricing, Availability, Testimonials, FAQ, Content, Audit Log, Analytics.
Keep answers concise and practical. The admin is non-technical.
${langInstruction}
For identity questions, answer exactly: "Mr Ahmad Alwakai lead developer"${contextBlock}`;
          const helpReply = await askGroq(systemPrompt, message, 400);
          reply = helpReply || "I'm having trouble right now. Try asking about stock, bookings, or alerts instead.";
        }
      }

      else if (plan.clarificationNeeded && plan.tools.length > 0 && plan.tools.every((t) => toolMap.get(t.toolName)?.kind === 'read')) {
        // Has clarification but tools are read-only — execute them to show context, then ask
        const output = await executePlan(plan, ctx);
        chatSession.context = { ...chatSession.context, lastToolResults: output.results.map((r) => ({ toolName: r.toolName, result: r.result, at: now })) };
        reply = await formatAgentResponse(plan.intent, output.results, memoryContext, lang);
        if (plan.clarificationNeeded) reply += '\n\n' + plan.clarificationNeeded;
        await rememberEntitiesFromResults(userId, output.results);
      }

      else if (planRequiresConfirmation(plan)) {
        // Write tools need confirmation — include risk assessment
        const riskInfo = buildRiskSummary(plan);
        const summary = plan.tools.map((t) => {
          const def = toolMap.get(t.toolName);
          const paramStr = Object.entries(t.params).map(([k, v]) => `${k}: ${v}`).join(', ');
          return `${def?.description ?? t.toolName} (${paramStr})`;
        }).join('\n');

        const pending = createPendingConfirmation(plan, summary);
        chatSession.context = { ...chatSession.context, pendingConfirmation: pending };
        const details = buildConfirmationDetails(plan);
        const riskNote = riskInfo.riskLevel !== 'low' ? `\n⚠️ ${riskInfo.summary}` : '';
        reply = `I'll do the following — please confirm:${riskNote}\n${summary}`;
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
        reply = await formatAgentResponse(plan.intent, output.results, memoryContext, lang);
        if (output.cards.some((c) => !c.success)) {
          actions = output.cards.filter((c) => !c.success).map((c) => ({ type: 'warning' as const, message: c.summary }));
        }

        // Phase 3: Add analytics cards for analytics tool results
        const analyticsToolNames = [
          'get_visitor_analytics', 'get_traffic_sources', 'get_top_pages',
          'get_realtime_visitors', 'get_conversion_funnel', 'get_demand_signals',
          'get_today_revenue', 'get_booking_completion_rate', 'get_quote_to_booking_rate',
          'get_customer_repeat_rate', 'get_peak_booking_hours',
        ];
        for (const r of output.results) {
          if (analyticsToolNames.includes(r.toolName) && r.result.success && r.result.data) {
            const d = r.result.data as Record<string, unknown>;
            const card = buildAnalyticsCard(r.toolName, d);
            if (card) actions.push(card);
          }
        }

        // Remember entities from results for future reference
        await rememberEntitiesFromResults(userId, output.results);
      }
    }
  }

  // Store assistant reply
  chatSession.messages.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString(), actions: actions.length > 0 ? actions : undefined });
  await persistSession(chatSession);

  // Return memory indicators for the UI
  const memoryIndicators = {
    recentEntities: sessionMemory.recentEntities.slice(0, 5).map((e) => ({
      type: e.type,
      ref: e.ref ?? e.id.slice(0, 8),
    })),
    pendingFollowUps: longTermMemory
      .filter((m) => m.kind === 'follow_up')
      .slice(0, 3)
      .map((m) => m.content),
    hasSummary: !!chatSession.summary,
  };

  return NextResponse.json({
    reply,
    actions,
    sessionId: chatSession.id,
    lang,
    memory: memoryIndicators,
  });
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

/* ── Phase 3: Build analytics card from tool results ── */
function buildAnalyticsCard(
  toolName: string,
  data: Record<string, unknown>,
): Extract<AgentAction, { type: 'analytics_card' }> | null {
  const num = (v: unknown) => Number(v ?? 0);
  const str = (v: unknown) => String(v ?? '');
  switch (toolName) {
    case 'get_visitor_analytics':
      return {
        type: 'analytics_card',
        title: 'Visitor Analytics',
        metric: `${num(data.totalVisitors)} visitors`,
        trend: `${num(data.totalPageViews)} page views`,
        breakdown: [
          { label: 'Mobile', value: num(data.mobileCount) },
          { label: 'Desktop', value: num(data.desktopCount) },
          { label: 'Returning', value: num(data.returningVisitors) },
          { label: 'Avg Session', value: `${num(data.avgSessionDuration)}s` },
        ],
      };
    case 'get_today_revenue':
      return {
        type: 'analytics_card',
        title: 'Today\'s Revenue',
        metric: `£${num(data.totalRevenue).toFixed(2)}`,
        breakdown: [
          { label: 'Bookings', value: num(data.bookingCount) },
          { label: 'Avg Order', value: `£${num(data.avgOrderValue).toFixed(2)}` },
        ],
      };
    case 'get_realtime_visitors':
      return {
        type: 'analytics_card',
        title: 'Live Visitors',
        metric: `${num(data.onlineNow)} online now`,
        trend: `${num(data.recentVisitors)} in last 5 min`,
      };
    case 'get_conversion_funnel': {
      return {
        type: 'analytics_card',
        title: 'Conversion Funnel',
        metric: str(data.conversionRate || '0%'),
        breakdown: [
          { label: 'Page Views', value: num(data.totalPageViews) },
          { label: 'Call Clicks', value: num(data.callClicks) },
          { label: 'Booking Starts', value: num(data.bookingStarts) },
          { label: 'Completed', value: num(data.bookingCompletes) },
        ],
      };
    }
    case 'get_booking_completion_rate':
      return {
        type: 'analytics_card',
        title: 'Completion Rate',
        metric: str(data.completionRate || '0%'),
        breakdown: [
          { label: 'Paid', value: num(data.totalPaid) },
          { label: 'Completed', value: num(data.completed) },
        ],
      };
    case 'get_customer_repeat_rate':
      return {
        type: 'analytics_card',
        title: 'Repeat Customers',
        metric: str(data.repeatRate || '0%'),
        breakdown: [
          { label: 'Total Customers', value: num(data.totalCustomers) },
          { label: 'Returning', value: num(data.repeatCustomers) },
        ],
      };
    default:
      return null;
  }
}
