import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '@/hooks/useLatestRef';
import { getAdminToken, getApiBaseUrl } from '@/lib/api';
import {
  accountPreferencesStorageKey, DEFAULT_ACCOUNT_PREFERENCES, parseAccountPreferences,
  type AccountPreferences,
} from '@/lib/account-preferences';
import { getAdminSessionRevision } from './useAdminSession';

interface Options {
  visible: boolean;
  userId: string | null | undefined;
  apiBaseUrl: string;
}

const pendingWrites = new Map<string, Promise<void>>();

function persistPreferences(key: string, preferences: AccountPreferences): Promise<void> {
  const operation = (pendingWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(
    () => AsyncStorage.setItem(key, JSON.stringify(preferences)),
  );
  pendingWrites.set(key, operation);
  void operation.finally(() => { if (pendingWrites.get(key) === operation) pendingWrites.delete(key); }).catch(() => {});
  return operation;
}

/** Local display settings only. Secure session storage is never read or changed. */
export function useAccountPreferences({ visible, userId, apiBaseUrl }: Options) {
  const token = getAdminToken();
  const revision = getAdminSessionRevision();
  const key = userId ? accountPreferencesStorageKey(apiBaseUrl, userId) : null;
  const scope = useMemo(() => ({ key, apiBaseUrl, revision, token }), [key, apiBaseUrl, revision, token]);
  const currentScope = useLatestRef(scope);
  const visibleRef = useLatestRef(visible);
  const mounted = useRef(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const loadedScope = useRef<typeof scope | null>(null);
  const [state, setState] = useState({ scope, preferences: { ...DEFAULT_ACCOUNT_PREFERENCES } });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'read' | 'write' | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const validScope = useCallback(() => mounted.current && visibleRef.current && currentScope.current === scope
    && Boolean(scope.key && scope.token) && getAdminToken() === scope.token
    && getApiBaseUrl() === scope.apiBaseUrl && getAdminSessionRevision() === scope.revision, [scope]);

  useEffect(() => {
    let active = true;
    generation.current += 1;
    mounted.current = true; busy.current = false; loadedScope.current = null;
    setState({ scope, preferences: { ...DEFAULT_ACCOUNT_PREFERENCES } });
    setError(null); setSaving(false); setLoading(visible && Boolean(scope.key && scope.token));
    if (visible && scope.key && scope.token) {
      const storageKey = scope.key;
      void (pendingWrites.get(storageKey) ?? Promise.resolve()).catch(() => {}).then(
        () => AsyncStorage.getItem(storageKey),
      ).then((raw) => {
        if (!active || !validScope()) return;
        const value: unknown = raw && raw.length <= 1_024 ? JSON.parse(raw) : null;
        loadedScope.current = scope;
        setState({ scope, preferences: parseAccountPreferences(value) });
      }).catch(() => {
        if (active && validScope()) setError('read');
      }).finally(() => {
        if (active && validScope()) setLoading(false);
      });
    }
    return () => { active = false; mounted.current = false; generation.current += 1; };
  }, [scope, visible, validScope, refreshRevision]);

  const preferences = useMemo(() => state.scope === scope ? state.preferences : { ...DEFAULT_ACCOUNT_PREFERENCES }, [state, scope]);
  const setPreferences = useCallback(async (next: Partial<Pick<AccountPreferences, 'language' | 'timeFormat'>>) => {
    if (!validScope() || !scope.key || busy.current || loadedScope.current !== scope) return false;
    const operationGeneration = generation.current;
    const stillCurrent = () => operationGeneration === generation.current && validScope();
    busy.current = true; setSaving(true); setError(null);
    const value = parseAccountPreferences({ ...preferences, ...next, version: 1 });
    try {
      await persistPreferences(scope.key, value);
      if (!stillCurrent()) return false;
      setState({ scope, preferences: value });
      return true;
    } catch {
      if (stillCurrent()) setError('write');
      return false;
    } finally {
      if (stillCurrent()) { busy.current = false; setSaving(false); }
    }
  }, [preferences, scope, validScope]);

  const refresh = useCallback(() => { if (validScope() && !busy.current) setRefreshRevision((value) => value + 1); }, [validScope]);
  return { preferences, loading, saving, error, setPreferences, refresh };
}
