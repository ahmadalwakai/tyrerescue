/** Local UI protection only. This module never reads, clears or revokes sign-in credentials. */
export interface AdminBiometricCapability {
  available: boolean;
  label: string;
  reason: string | null;
}

export interface AdminAppLockScope {
  apiBaseUrl: string;
  userId: string;
  sessionRevision: number;
}

export interface AdminAppLockState {
  identity: string | null;
  ready: boolean;
  enabled: boolean;
  locked: boolean;
  busy: boolean;
  capability: AdminBiometricCapability;
  error: string | null;
}

export interface AdminAppLockDependencies {
  readPreference(key: string): Promise<string | null>;
  writePreference(key: string, value: string): Promise<void>;
  capability(): Promise<AdminBiometricCapability>;
  authenticate(promptMessage: string): Promise<{ success: boolean; message?: string }>;
}

const UNKNOWN: AdminBiometricCapability = { available: false, label: 'Biometrics', reason: 'Checking biometric availability…' };
const PREFERENCE_ERROR = 'The app lock preference could not be read. Retry to protect your saved sign-in.';

/** The durable flag is separate for every backend and administrator, never a credential. */
export function adminAppLockPreferenceKey(scope: Pick<AdminAppLockScope, 'apiBaseUrl' | 'userId'>): string {
  return `assistedChat.appLock.v1.${encodeURIComponent(scope.apiBaseUrl.replace(/\/+$/, '').toLowerCase())}.${encodeURIComponent(scope.userId)}`;
}

export function adminAppLockIdentity(scope: AdminAppLockScope | null): string | null {
  return scope ? `${adminAppLockPreferenceKey(scope)}.session.${scope.sessionRevision}` : null;
}

function initial(identity: string | null): AdminAppLockState {
  return { identity, ready: identity === null, enabled: false, locked: false, busy: false, capability: UNKNOWN, error: null };
}

/** Dependency injected so cancellation, persistence and session races can be tested without a phone or network. */
export class AdminAppLockController {
  private state = initial(null);
  private scope: AdminAppLockScope | null = null;
  private generation = 0;
  private lockGeneration = 0;
  private foreground = true;
  private authenticating = false;
  private writes = new Map<string, Promise<unknown>>();
  private listeners = new Set<(state: AdminAppLockState) => void>();

  constructor(private readonly dependencies: AdminAppLockDependencies) {}

  getState = (): AdminAppLockState => this.state;
  isAuthenticating = (): boolean => this.authenticating;
  subscribe = (listener: (state: AdminAppLockState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(update: Partial<AdminAppLockState>): void {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener(this.state);
  }

  async setScope(scope: AdminAppLockScope | null): Promise<void> {
    const identity = adminAppLockIdentity(scope);
    if (identity === this.state.identity && this.state.ready) return;
    const generation = ++this.generation;
    this.lockGeneration += 1;
    this.scope = scope;
    this.authenticating = false;
    this.state = initial(identity);
    this.publish({});
    if (!scope) return;
    const key = adminAppLockPreferenceKey(scope);
    try {
      // An in-flight write for this same identity must finish before a restore.
      await this.writes.get(key)?.catch(() => undefined);
      const [flag, capability] = await Promise.all([
        this.dependencies.readPreference(key), this.dependencies.capability(),
      ]);
      if (generation !== this.generation) return;
      if (flag !== null && flag !== '0' && flag !== '1') throw new Error('Invalid local lock flag.');
      this.publish({ ready: true, enabled: flag === '1', locked: flag === '1', capability, error: null });
    } catch {
      if (generation === this.generation) this.publish({ ready: false, locked: true, error: PREFERENCE_ERROR });
    }
  }

  async retry(): Promise<void> {
    if (!this.state.ready) return this.setScope(this.scope);
    return this.refreshCapability();
  }

  async refreshCapability(): Promise<void> {
    const generation = this.generation;
    try {
      const capability = await this.dependencies.capability();
      if (generation === this.generation) this.publish({ capability });
    } catch {
      if (generation === this.generation) this.publish({ capability: { available: false, label: 'Biometrics', reason: 'Biometrics could not be checked. Retry or open device settings.' } });
    }
  }

  setForeground(active: boolean): void {
    this.foreground = active;
    if (!active) {
      // Results arriving after a real background transition cannot unlock the app.
      this.lockGeneration += 1;
      if (this.state.enabled) this.publish({ locked: true });
    }
  }

  manualLock(): void {
    if (!this.state.enabled) return;
    this.lockGeneration += 1;
    this.publish({ locked: true, error: null });
  }

  private async authenticate(prompt: string, generation: number, lockGeneration: number): Promise<boolean> {
    this.authenticating = true;
    try {
      const result = await this.dependencies.authenticate(prompt);
      if (generation !== this.generation || lockGeneration !== this.lockGeneration || !this.foreground) return false;
      if (!result.success) this.publish({ error: result.message ?? 'Authentication was not completed. Your saved sign-in is unchanged.' });
      return result.success;
    } catch {
      if (generation === this.generation) this.publish({ error: 'Biometric authentication is unavailable. Retry or open device settings. Your saved sign-in is unchanged.' });
      return false;
    } finally {
      if (generation === this.generation) this.authenticating = false;
    }
  }

  async unlock(): Promise<boolean> {
    if (!this.scope || !this.state.ready || !this.state.enabled || this.state.busy || !this.foreground) return false;
    const generation = this.generation;
    const lockGeneration = this.lockGeneration;
    this.publish({ busy: true, error: null });
    try {
      const capability = await this.dependencies.capability();
      if (generation !== this.generation || lockGeneration !== this.lockGeneration || !this.foreground) return false;
      this.publish({ capability });
      if (!capability.available) { this.publish({ error: capability.reason }); return false; }
      if (!await this.authenticate('Unlock Assisted Chat', generation, lockGeneration)) return false;
      this.publish({ locked: false, error: null });
      return true;
    } catch {
      if (generation === this.generation) this.publish({ error: 'Biometrics are unavailable. Retry or open device settings.' });
      return false;
    } finally {
      if (generation === this.generation) this.publish({ busy: false });
    }
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    const scope = this.scope;
    if (!scope || !this.state.ready || this.state.busy || !this.foreground) return false;
    if (enabled === this.state.enabled) return true;
    const generation = this.generation;
    const lockGeneration = this.lockGeneration;
    this.publish({ busy: true, error: null });
    try {
      const capability = await this.dependencies.capability();
      if (generation !== this.generation || lockGeneration !== this.lockGeneration || !this.foreground) return false;
      this.publish({ capability });
      if (!capability.available) { this.publish({ error: capability.reason }); return false; }
      if (!await this.authenticate(enabled ? 'Enable Assisted Chat app lock' : 'Turn off Assisted Chat app lock', generation, lockGeneration)) return false;
      const key = adminAppLockPreferenceKey(scope);
      const pending = (this.writes.get(key) ?? Promise.resolve()).catch(() => undefined)
        .then(() => this.dependencies.writePreference(key, enabled ? '1' : '0'));
      this.writes.set(key, pending);
      await pending;
      if (this.writes.get(key) === pending) this.writes.delete(key);
      if (generation !== this.generation) return false;
      // Persisted enablement still takes effect if the app backgrounds while saving.
      this.publish({ enabled, locked: enabled && (!this.foreground || lockGeneration !== this.lockGeneration), error: null });
      return true;
    } catch {
      if (generation === this.generation) this.publish({ error: 'The app lock change could not be saved. The previous setting is still active.' });
      return false;
    } finally {
      if (generation === this.generation) this.publish({ busy: false });
    }
  }
}
