import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getAdminToken, getApiBaseUrl, isCentralAdminApiBaseUrl, setWorkspaceSourceApp } from '@/lib/api';
import { getAdminSessionRevision, useAdminSession } from './useAdminSession';

export interface AdminWorkspaceItem {
  sourceApp: string;
  sourceLabel: string;
  origin: string | null;
  description: string;
}

interface WorkspaceScope {
  baseUrl: string;
  userId: string;
  token: string;
  sessionRevision: number;
}

interface WorkspaceState {
  epoch: number;
  items: AdminWorkspaceItem[];
  selectedWorkspace: AdminWorkspaceItem | null;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
}

const EMPTY: WorkspaceState = { epoch: 0, items: [], selectedWorkspace: null, hydrated: false, loading: false, error: null };
const LOAD_ERROR = 'Workspaces could not be loaded. Please retry. Your sign-in has not changed.';
const CACHED_ERROR = 'Workspaces could not be refreshed. Your saved selection is available; retry when connected.';
const SAVE_ERROR = 'The workspace could not be saved. Your previous selection is still active. Please retry.';
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9_]{0,59}$/;
let state = EMPTY;
let scopeEpoch = 0;
let activeScope: WorkspaceScope | null = null;
let loadOperation: { controller: AbortController } | null = null;
let selectionOperation: object | null = null;
let storageOperations: Promise<unknown> = Promise.resolve();
const listeners = new Set<(next: WorkspaceState) => void>();

function storageKey(scope: WorkspaceScope): string {
  return `assistedChat.workspaceSelection.v1.${encodeURIComponent(scope.baseUrl)}.${encodeURIComponent(scope.userId)}`;
}

function sameScope(left: WorkspaceScope | null, right: WorkspaceScope | null): boolean {
  return left === right || Boolean(left && right && left.baseUrl === right.baseUrl && left.userId === right.userId
    && left.token === right.token && left.sessionRevision === right.sessionRevision);
}

function current(scope: WorkspaceScope): boolean {
  return activeScope === scope && scope.token === getAdminToken() && scope.baseUrl === getApiBaseUrl()
    && scope.sessionRevision === getAdminSessionRevision() && isCentralAdminApiBaseUrl(scope.baseUrl);
}

function publish(next: WorkspaceState): void {
  state = next;
  for (const listener of listeners) listener(next);
}

function subscribe(listener: (next: WorkspaceState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) activateScope(null);
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseAdminWorkspaces(payload: unknown): AdminWorkspaceItem[] {
  if (!record(payload) || !Array.isArray(payload.items) || payload.items.length > 100) throw new Error(LOAD_ERROR);
  const items: AdminWorkspaceItem[] = [];
  const seen = new Set<string>();
  for (const value of payload.items) {
    // Unknown historical source rows are informational, not selectable scopes.
    if (!record(value) || value.configured !== true) continue;
    if (typeof value.sourceApp !== 'string' || !SOURCE_PATTERN.test(value.sourceApp) || seen.has(value.sourceApp)
      || typeof value.sourceLabel !== 'string' || !value.sourceLabel.trim() || value.sourceLabel.length > 120
      || typeof value.description !== 'string' || value.description.length > 1_000
      || !(value.origin === null || typeof value.origin === 'string')) throw new Error(LOAD_ERROR);
    if (typeof value.origin === 'string') {
      let origin: URL;
      try { origin = new URL(value.origin); } catch { throw new Error(LOAD_ERROR); }
      if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password) throw new Error(LOAD_ERROR);
    }
    seen.add(value.sourceApp);
    items.push({ sourceApp: value.sourceApp, sourceLabel: value.sourceLabel.trim(), origin: value.origin,
      description: value.description });
  }
  return items;
}

function savedSource(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return record(value) && typeof value.sourceApp === 'string' && SOURCE_PATTERN.test(value.sourceApp) ? value.sourceApp : null;
  } catch { return null; }
}

async function loadWorkspaces(scope: WorkspaceScope): Promise<void> {
  if (!current(scope) || loadOperation || selectionOperation) return;
  const operation = { controller: new AbortController() };
  loadOperation = operation;
  const restoring = !state.hydrated;
  publish({ ...state, loading: true, error: null });
  try {
    const [remote, local] = await Promise.allSettled([
      api.get<unknown>('/api/mobile/admin/project-sources', { signal: operation.controller.signal, timeoutMs: 15_000 }),
      restoring ? storageOperations.catch(() => {}).then(() => current(scope)
        ? Promise.all([AsyncStorage.getItem(storageKey(scope)), AsyncStorage.getItem(`${storageKey(scope)}.catalog`)])
        : [null, null] as [string | null, string | null]) : Promise.resolve<[string | null, string | null]>([null, null]),
    ]);
    if (!current(scope) || loadOperation !== operation || operation.controller.signal.aborted) return;
    if (local.status === 'rejected') throw new Error(LOAD_ERROR);
    const [persisted, cachedCatalog] = local.value;
    const requested = restoring ? savedSource(persisted) : state.selectedWorkspace?.sourceApp ?? null;
    let items: AdminWorkspaceItem[] | null = null;
    if (remote.status === 'fulfilled') {
      try { items = parseAdminWorkspaces(remote.value); } catch { /* A malformed response is unavailable, never trusted. */ }
    }
    if (items === null) {
      if (!restoring) {
        publish({ ...state, loading: false, error: CACHED_ERROR });
        return;
      }
      let cachedItems: AdminWorkspaceItem[] | null = null;
      if (cachedCatalog) {
        try { cachedItems = parseAdminWorkspaces(JSON.parse(cachedCatalog)); } catch { /* Keep an unverified selection blocked. */ }
      }
      // A nonsecret malformed preference is repairable on a live refresh,
      // but offline we must not guess that a previously chosen source was All.
      if (persisted !== null) {
        let preference: unknown;
        try { preference = JSON.parse(persisted); } catch { throw new Error(LOAD_ERROR); }
        if (!record(preference) || !(preference.sourceApp === null
          || (typeof preference.sourceApp === 'string' && SOURCE_PATTERN.test(preference.sourceApp)))) throw new Error(LOAD_ERROR);
      }
      const selectedWorkspace = cachedItems?.find((item) => item.sourceApp === requested) ?? null;
      if (requested !== null && !selectedWorkspace) throw new Error(LOAD_ERROR);
      setWorkspaceSourceApp(selectedWorkspace?.sourceApp ?? null);
      publish({ ...state, items: cachedItems ?? [], selectedWorkspace, hydrated: true, loading: false, error: CACHED_ERROR });
      return;
    }
    const selectedWorkspace = items.find((item) => item.sourceApp === requested) ?? null;
    const catalog = JSON.stringify({ items: items.map((item) => ({ ...item, configured: true })) });
    const caching = storageOperations.catch(() => {}).then(async () => {
      if (current(scope) && loadOperation === operation) await AsyncStorage.setItem(`${storageKey(scope)}.catalog`, catalog);
    });
    storageOperations = caching;
    // A verified live list remains usable if the optional offline cache cannot
    // be saved. No credential or selection is changed by a catalog write.
    await caching.catch(() => {});
    if (!current(scope) || loadOperation !== operation || operation.controller.signal.aborted) return;
    setWorkspaceSourceApp(selectedWorkspace?.sourceApp ?? null);
    publish({ ...state, items, selectedWorkspace, hydrated: true, loading: false, error: null });
  } catch {
    if (current(scope) && loadOperation === operation && !operation.controller.signal.aborted) {
      publish({ ...state, loading: false, error: LOAD_ERROR });
    }
  } finally {
    if (loadOperation === operation) loadOperation = null;
  }
}

function activateScope(next: WorkspaceScope | null): void {
  if (sameScope(activeScope, next)) return;
  loadOperation?.controller.abort();
  loadOperation = null;
  selectionOperation = null;
  activeScope = next;
  setWorkspaceSourceApp(null);
  publish({ ...EMPTY, epoch: ++scopeEpoch, loading: Boolean(next) });
  if (next) void loadWorkspaces(next);
}

async function chooseWorkspace(sourceApp: string | null, isCallerCurrent?: () => boolean): Promise<boolean> {
  const scope = activeScope;
  if (!scope || !current(scope) || !state.hydrated || state.loading || selectionOperation
    || (isCallerCurrent && !isCallerCurrent())) return false;
  const selectedWorkspace = sourceApp === null ? null : state.items.find((item) => item.sourceApp === sourceApp);
  if (selectedWorkspace === undefined) {
    publish({ ...state, error: 'This workspace is not available. Refresh the list and try again.' });
    return false;
  }
  if ((state.selectedWorkspace?.sourceApp ?? null) === sourceApp) return true;
  const operation = {};
  selectionOperation = operation;
  const stillCurrent = () => current(scope) && selectionOperation === operation && (!isCallerCurrent || isCallerCurrent());
  const key = storageKey(scope);
  publish({ ...state, error: null });
  try {
    const saving = storageOperations.catch(() => {}).then(async () => {
      if (!stillCurrent()) return false;
      const previous = await AsyncStorage.getItem(key);
      if (!stillCurrent()) return false;
      await AsyncStorage.setItem(key, JSON.stringify({ sourceApp }));
      if (stillCurrent()) return true;
      // An account change or closed caller must not leave a stale choice that
      // unexpectedly takes effect the next time that account opens the app.
      if (previous === null) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, previous);
      return false;
    });
    storageOperations = saving;
    if (!await saving || !stillCurrent()) return false;
    setWorkspaceSourceApp(sourceApp);
    publish({ ...state, selectedWorkspace, error: null });
    return true;
  } catch {
    if (stillCurrent()) publish({ ...state, error: SAVE_ERROR });
    return false;
  } finally {
    if (selectionOperation === operation) selectionOperation = null;
  }
}

/** All hook instances share one central account's source selection. */
export function useAdminWorkspace() {
  const session = useAdminSession();
  const baseUrl = getApiBaseUrl();
  const token = getAdminToken();
  const sessionRevision = getAdminSessionRevision();
  const userId = session.status === 'logged-in' ? session.user?.id ?? null : null;
  const enabled = Boolean(userId && token && isCentralAdminApiBaseUrl(baseUrl));
  const [observed, setObserved] = useState<WorkspaceState>(() => state);

  useEffect(() => subscribe(setObserved), []);

  useEffect(() => {
    activateScope(enabled && userId && token ? { baseUrl, userId, token, sessionRevision } : null);
  }, [baseUrl, enabled, sessionRevision, token, userId]);

  const matches = enabled && observed.epoch === state.epoch
    && sameScope(activeScope, userId && token ? { baseUrl, userId, token, sessionRevision } : null);
  const refresh = useCallback(async () => {
    const scope = activeScope;
    if (scope && enabled && sameScope(scope, userId && token ? { baseUrl, userId, token, sessionRevision } : null)) {
      await loadWorkspaces(scope);
    }
  }, [baseUrl, enabled, sessionRevision, token, userId]);
  const selectWorkspace = useCallback(async (sourceApp: string | null, isCallerCurrent?: () => boolean) => {
    const scope = activeScope;
    if (!scope || !enabled || !sameScope(scope, userId && token ? { baseUrl, userId, token, sessionRevision } : null)) return false;
    return chooseWorkspace(sourceApp, () => current(scope) && (!isCallerCurrent || isCallerCurrent()));
  }, [baseUrl, enabled, sessionRevision, token, userId]);

  return {
    items: matches ? observed.items : EMPTY.items,
    loading: enabled && (!matches || observed.loading),
    hydrated: Boolean(matches && observed.hydrated),
    error: matches ? observed.error : userId && token && !enabled ? 'Connect to the central admin service to choose a workspace.' : null,
    selectedWorkspace: matches ? observed.selectedWorkspace : null,
    selectWorkspace,
    refresh,
  };
}
