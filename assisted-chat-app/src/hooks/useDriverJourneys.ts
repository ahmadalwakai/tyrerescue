import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, getAdminToken, getApiBaseUrl } from '@/lib/api';
import { addAdminNotificationReceivedListener } from '@/lib/notifications';
import { canDecideDriverJourney, fetchDriverJourneyItems, isJourneyId, mergeDriverJourneyFeed, submitFreshDriverJourneyDecision, type DriverJourneyItem } from '@/types/driver-journeys';

export function useDriverJourneys(projectId?: string | null) {
  const token = getAdminToken();
  const baseUrl = getApiBaseUrl();
  const scope = useMemo(() => ({ token, baseUrl, projectId }), [token, baseUrl, projectId]);
  const activeScope = useRef(scope);
  const [state, setState] = useState<{ scope: typeof scope; items: DriverJourneyItem[] }>({ scope, items: [] });
  const [visible, setVisible] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const requestNumber = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const deferredUntil = useRef(new Map<string, number>());
  const selectedRef = useRef<string | null>(null);
  const validScope = useCallback(() => mounted.current && activeScope.current === scope && getAdminToken() === scope.token
    && getApiBaseUrl() === scope.baseUrl && Boolean(scope.token), [scope]);

  const refresh = useCallback(async (eventId?: string): Promise<DriverJourneyItem[] | null> => {
    if (!validScope()) return null;
    const sequence = ++requestNumber.current;
    const controller = new AbortController(); controllers.current.add(controller);
    setLoading(true);
    try {
      const items = await fetchDriverJourneyItems(api, eventId, controller.signal);
      if (!validScope() || controller.signal.aborted || sequence !== requestNumber.current) return null;
      setState((previous) => ({ scope, items: mergeDriverJourneyFeed(previous.scope === scope ? previous.items : [], items, eventId) })); setError(null);
      return items;
    } catch (cause) {
      if (validScope() && !controller.signal.aborted && sequence === requestNumber.current) {
        setError(cause instanceof Error ? cause.message : 'Could not load driver journeys.');
        // Permission failures must not leave a previously actionable item visible.
        if (cause instanceof ApiError && [401, 403].includes(cause.status)) setState({ scope, items: [] });
      }
      return null;
    } finally {
      controllers.current.delete(controller);
      if (validScope() && sequence === requestNumber.current) setLoading(false);
    }
  }, [scope, validScope]);

  useEffect(() => {
    activeScope.current = scope; mounted.current = true; busyRef.current = false; deferredUntil.current.clear();
    setState({ scope, items: [] }); setVisible(false); setSelectedEventId(null); setError(null); setBusy(false);
    const activeControllers = controllers.current;
    // Always poll the whole feed, even while reviewing one exact push event.
    const poll = () => { if (AppState.currentState === 'active' && !busyRef.current) void refresh(); };
    poll();
    const timer = setInterval(poll, 20_000);
    const appState = AppState.addEventListener('change', (value) => { if (value === 'active') poll(); });
    const push = addAdminNotificationReceivedListener(poll);
    return () => {
      mounted.current = false;
      clearInterval(timer); appState.remove(); push?.remove();
      activeControllers.forEach((controller) => controller.abort()); activeControllers.clear();
    };
  }, [scope, refresh]);

  const items = useMemo(() => state.scope === scope ? state.items : [], [state, scope]);
  useEffect(() => {
    if (visible || busy || !scope.token) return;
    const pending = items.find((item) => !item.isRead && canDecideDriverJourney(item)
      && (deferredUntil.current.get(item.eventId) ?? 0) <= Date.now());
    if (pending) { setSelectedEventId(pending.eventId); setVisible(true); }
  }, [items, visible, busy, scope.token]);

  const open = useCallback(async (eventId?: string) => {
    if (busyRef.current || !validScope() || (eventId && !isJourneyId(eventId))) return;
    setSelectedEventId(eventId ?? null); setVisible(true); setError(null);
    const fresh = await refresh(eventId);
    if (!validScope() || !eventId || !fresh) return;
    const item = fresh.find((candidate) => candidate.eventId === eventId);
    if (!item) setError('This journey event is no longer available.');
  }, [refresh, validScope]);

  const close = useCallback(() => {
    if (busyRef.current) return;
    if (selectedRef.current) deferredUntil.current.set(selectedRef.current, Date.now() + 60_000);
    setVisible(false); setSelectedEventId(null);
  }, []);
  useEffect(() => { selectedRef.current = selectedEventId; }, [selectedEventId]);

  const markRead = useCallback(async (eventId: string) => {
    if (!validScope() || !isJourneyId(eventId)) return;
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      await api.post(`/api/mobile/admin/driver-journeys/events/${encodeURIComponent(eventId)}/read`, {}, { signal: controller.signal });
      if (validScope()) await refresh();
    } catch (cause) {
      if (validScope() && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not mark this alert as read.');
    } finally { controllers.current.delete(controller); }
  }, [refresh, validScope]);

  const decide = useCallback(async (eventId: string, decision: 'yes' | 'no') => {
    if (busyRef.current || !validScope() || !isJourneyId(eventId)) return;
    busyRef.current = true; setBusy(true); setError(null);
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      await submitFreshDriverJourneyDecision(api, eventId, decision, validScope, controller.signal);
      if (!validScope() || controller.signal.aborted) return;
      await markRead(eventId);
    } catch (cause) {
      if (validScope() && !controller.signal.aborted) {
        await refresh(eventId);
        if (!validScope() || controller.signal.aborted) return;
        setError(cause instanceof ApiError && cause.status === 409
          ? 'This journey changed or expired. Its current status has been reloaded.'
          : cause instanceof Error ? cause.message : 'Could not save your decision.');
      }
    } finally {
      controllers.current.delete(controller);
      if (validScope()) { busyRef.current = false; setBusy(false); }
    }
  }, [markRead, refresh, validScope]);

  return { items, visible, selectedEventId, loading, busy, error, open, close,
    refresh: () => refresh(selectedEventId ?? undefined), select: (eventId: string) => { void open(eventId); },
    markRead, decide, unreadCount: items.filter((item) => !item.isRead).length };
}
