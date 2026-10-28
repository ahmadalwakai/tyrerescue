export interface BonlineOutboundIntent {
  idempotencyKey: string;
  status: 'pending' | 'accepted' | 'unknown' | 'failed';
  message: string;
}

/** Keep uncertain requests across modal remounts, so retrying cannot dial twice. */
export class BonlineOutboundIntents {
  private scope: string | null = null;
  private intents = new Map<string, BonlineOutboundIntent>();

  get(scope: string, context: string): BonlineOutboundIntent | undefined {
    if (scope !== this.scope) {
      this.scope = scope;
      this.intents.clear();
    }
    return this.intents.get(context);
  }

  begin(scope: string, context: string, createKey: () => string, newTerminalRequest = false): BonlineOutboundIntent {
    const existing = this.get(scope, context);
    if (existing && (!newTerminalRequest || (existing.status !== 'accepted' && existing.status !== 'failed'))) return existing;
    // Uncertain requests must never be evicted and retried with a different key.
    if (!existing && this.intents.size >= 256) throw new Error('The call request limit for this session has been reached.');
    const intent: BonlineOutboundIntent = { idempotencyKey: createKey(), status: 'pending', message: 'Requesting call…' };
    this.intents.set(context, intent);
    return intent;
  }

  update(scope: string, context: string, key: string, status: BonlineOutboundIntent['status'], message: string): void {
    // A late response must not reset a newer admin/workspace cache.
    if (scope !== this.scope) return;
    const intent = this.intents.get(context);
    if (intent?.idempotencyKey === key) this.intents.set(context, { idempotencyKey: key, status, message });
  }
}

export const bonlineOutboundIntents = new BonlineOutboundIntents();
