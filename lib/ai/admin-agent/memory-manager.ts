/* ── Admin Agent – Memory Manager ─────────────────────── */
import { db } from '@/lib/db';
import { agentMemory, chatSessions } from '@/lib/db/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { askGroq } from '@/lib/groq';
import type { ChatMessage, AgentSessionContext } from './types';

/* ── Types ── */

export type MemoryKind = 'entity_ref' | 'preference' | 'follow_up' | 'fact';

export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  entityType?: string | null;
  entityId?: string | null;
  entityRef?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | null;
}

export interface SessionMemory {
  recentEntities: { type: string; id: string; ref?: string }[];
  lastActionContext?: string;
  pendingFollowUps: string[];
}

/* ── Long-term memory (DB-backed) ── */

/** Store a long-term memory entry for this admin user */
export async function remember(
  userId: string,
  kind: MemoryKind,
  content: string,
  opts?: {
    entityType?: string;
    entityId?: string;
    entityRef?: string;
    metadata?: Record<string, unknown>;
    ttlHours?: number;
  },
): Promise<void> {
  const expiresAt = opts?.ttlHours
    ? new Date(Date.now() + opts.ttlHours * 3600_000)
    : null;

  // Upsert: if same kind+entity exists, update it
  if (opts?.entityType && opts?.entityId) {
    const [existing] = await db
      .select({ id: agentMemory.id })
      .from(agentMemory)
      .where(
        and(
          eq(agentMemory.userId, userId),
          eq(agentMemory.kind, kind),
          eq(agentMemory.entityType, opts.entityType),
          eq(agentMemory.entityId, opts.entityId),
        ),
      )
      .limit(1);

    if (existing) {
      await db.update(agentMemory).set({
        content,
        entityRef: opts?.entityRef ?? null,
        metadata: opts?.metadata ?? null,
        expiresAt,
        updatedAt: new Date(),
      }).where(eq(agentMemory.id, existing.id));
      return;
    }
  }

  await db.insert(agentMemory).values({
    userId,
    kind,
    entityType: opts?.entityType ?? null,
    entityId: opts?.entityId ?? null,
    entityRef: opts?.entityRef ?? null,
    content,
    metadata: opts?.metadata ?? null,
    expiresAt,
  });

  // Cap total memories per user at 200
  await pruneOldMemories(userId, 200);
}

/** Recall relevant memories for the current context */
export async function recall(
  userId: string,
  opts?: { kind?: MemoryKind; entityType?: string; limit?: number },
): Promise<MemoryEntry[]> {
  const now = new Date();
  const conditions = [
    eq(agentMemory.userId, userId),
    // Exclude expired
    sql`(${agentMemory.expiresAt} IS NULL OR ${agentMemory.expiresAt} > ${now})`,
  ];

  if (opts?.kind) conditions.push(eq(agentMemory.kind, opts.kind));
  if (opts?.entityType) conditions.push(eq(agentMemory.entityType, opts.entityType));

  const rows = await db
    .select({
      id: agentMemory.id,
      kind: agentMemory.kind,
      entityType: agentMemory.entityType,
      entityId: agentMemory.entityId,
      entityRef: agentMemory.entityRef,
      content: agentMemory.content,
      metadata: agentMemory.metadata,
      createdAt: agentMemory.createdAt,
    })
    .from(agentMemory)
    .where(and(...conditions))
    .orderBy(desc(agentMemory.updatedAt))
    .limit(opts?.limit ?? 30);

  return rows as MemoryEntry[];
}

/** Prune oldest memories beyond the cap */
async function pruneOldMemories(userId: string, maxCount: number): Promise<void> {
  const rows = await db
    .select({ id: agentMemory.id })
    .from(agentMemory)
    .where(eq(agentMemory.userId, userId))
    .orderBy(desc(agentMemory.updatedAt));

  if (rows.length > maxCount) {
    const toDelete = rows.slice(maxCount);
    for (const row of toDelete) {
      await db.delete(agentMemory).where(eq(agentMemory.id, row.id));
    }
  }
}

/** Delete a specific follow-up once resolved */
export async function resolveFollowUp(
  userId: string,
  memoryId: string,
): Promise<void> {
  await db.delete(agentMemory).where(
    and(eq(agentMemory.id, memoryId), eq(agentMemory.userId, userId)),
  );
}

/* ── Session memory helpers ── */

/** Extract session memory from the stored context */
export function extractSessionMemory(
  context?: AgentSessionContext,
): SessionMemory {
  return {
    recentEntities: context?.lastEntities ?? [],
    lastActionContext: context?.lastToolResults
      ? context.lastToolResults.map((r) => `${r.toolName}: ${r.result.success ? 'ok' : 'fail'}`).join(', ')
      : undefined,
    pendingFollowUps: [],
  };
}

/** Build a compressed context summary for LLM from memories + session */
export function buildMemoryContext(
  longTerm: MemoryEntry[],
  session: SessionMemory,
): string {
  const parts: string[] = [];

  // Recent entities (from this session)
  if (session.recentEntities.length > 0) {
    const refs = session.recentEntities
      .map((e) => e.ref ? `${e.type}:${e.ref}` : `${e.type}:${e.id.slice(0, 8)}`)
      .join(', ');
    parts.push(`Recent entities: ${refs}`);
  }

  // Long-term entity refs
  const entityRefs = longTerm.filter((m) => m.kind === 'entity_ref');
  if (entityRefs.length > 0) {
    const refs = entityRefs.slice(0, 10).map((m) => m.content).join('; ');
    parts.push(`Known entities: ${refs}`);
  }

  // Preferences
  const prefs = longTerm.filter((m) => m.kind === 'preference');
  if (prefs.length > 0) {
    parts.push(`Admin preferences: ${prefs.map((m) => m.content).join('; ')}`);
  }

  // Follow-ups
  const followUps = longTerm.filter((m) => m.kind === 'follow_up');
  if (followUps.length > 0) {
    parts.push(`Pending follow-ups: ${followUps.map((m) => m.content).join('; ')}`);
  }

  // Last action context
  if (session.lastActionContext) {
    parts.push(`Last action: ${session.lastActionContext}`);
  }

  return parts.join('\n');
}

/* ── Message summarization ── */

const SUMMARIZE_THRESHOLD = 40; // messages before we summarize older ones
const KEEP_RECENT = 15; // always keep the newest N messages

/** Summarize old messages to prevent context bloat */
export async function summarizeIfNeeded(
  messages: ChatMessage[],
  existingSummary?: string | null,
): Promise<{ messages: ChatMessage[]; summary: string | null }> {
  if (messages.length < SUMMARIZE_THRESHOLD) {
    return { messages, summary: existingSummary ?? null };
  }

  const oldMessages = messages.slice(0, messages.length - KEEP_RECENT);
  const recentMessages = messages.slice(-KEEP_RECENT);

  // Build a text block of old messages for summarization
  const oldText = oldMessages
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const previousContext = existingSummary
    ? `Previous summary: ${existingSummary}\n\n`
    : '';

  try {
    const summary = await askGroq(
      'You are summarizing a conversation between an admin and their AI assistant at a tyre fitting business. Produce a brief summary (max 150 words) capturing: key entities discussed (booking refs, product names, driver names), decisions made, actions taken, and any unresolved topics. Output only the summary text.',
      `${previousContext}Conversation to summarize:\n${oldText}`,
      300,
    );

    if (summary && summary.length > 10) {
      return { messages: recentMessages, summary };
    }
  } catch { /* fall through */ }

  // Fallback: just trim without summarizing
  return { messages: recentMessages, summary: existingSummary ?? null };
}

/* ── Auto-remember entities from tool results ── */

export async function rememberEntitiesFromResults(
  userId: string,
  results: { toolName: string; result: { success: boolean; data?: unknown } }[],
): Promise<void> {
  for (const r of results) {
    if (!r.result.success || !r.result.data) continue;
    const data = r.result.data;

    if (Array.isArray(data)) {
      for (const item of data.slice(0, 3)) {
        await rememberEntity(userId, r.toolName, item as Record<string, unknown>);
      }
    } else {
      await rememberEntity(userId, r.toolName, data as Record<string, unknown>);
    }
  }
}

async function rememberEntity(
  userId: string,
  toolName: string,
  data: Record<string, unknown>,
): Promise<void> {
  const id = data.id as string | undefined;
  if (!id) return;

  const ref = (data.refNumber as string) ?? (data.sizeDisplay as string) ?? undefined;
  const entityType = inferEntityType(toolName, data);
  const label = buildEntityLabel(entityType, data);

  await remember(userId, 'entity_ref', label, {
    entityType,
    entityId: id,
    entityRef: ref,
    metadata: { source: toolName },
    ttlHours: 168, // 7 days
  });
}

function inferEntityType(
  toolName: string,
  data: Record<string, unknown>,
): string {
  if (data.refNumber) return 'booking';
  if (data.brand && data.sizeDisplay) return 'product';
  if (data.isOnline !== undefined) return 'driver';
  if (data.phone && data.status === 'pending') return 'callback';
  if (toolName.includes('message')) return 'message';
  return 'entity';
}

function buildEntityLabel(
  entityType: string,
  data: Record<string, unknown>,
): string {
  switch (entityType) {
    case 'booking':
      return `Booking ${data.refNumber} (${data.status}, ${data.customerName})`;
    case 'product':
      return `${data.brand} ${data.pattern ?? ''} ${data.sizeDisplay} (stock: ${data.stockNew})`;
    case 'driver':
      return `Driver ${data.userName ?? data.id} (${data.status})`;
    case 'callback':
      return `Callback from ${data.name} (${data.phone})`;
    case 'message':
      return `Message from ${data.name ?? data.email ?? 'unknown'}`;
    default:
      return `${entityType}: ${data.id}`;
  }
}
