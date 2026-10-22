import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getAdminSessionRevision } from './useAdminSession';
import { getAdminToken, getApiContextRevision } from '@/lib/api';
import { createChatVoiceRecorder, type VoiceRecordingState } from '@/lib/chat-voice';

interface Options { visible: boolean; conversationId: string | null; scopeKey: string }
const IDLE: VoiceRecordingState = { phase: 'idle', durationMillis: 0 };

export function useChatVoiceRecorder({ visible, conversationId, scopeKey }: Options) {
  const identity = `${visible}:${conversationId ?? ''}:${scopeKey}`;
  const [snapshot, setSnapshot] = useState({ identity, state: IDLE });
  if (snapshot.identity !== identity) setSnapshot({ identity, state: IDLE });
  const current = useRef<ReturnType<typeof createChatVoiceRecorder> | null>(null);
  useLayoutEffect(() => {
    if (!visible || !conversationId) return;
    let disposed = false;
    const token = getAdminToken();
    const revision = getApiContextRevision();
    const sessionRevision = getAdminSessionRevision();
    const recorder = createChatVoiceRecorder(
      () => !disposed && AppState.currentState !== 'background' && token === getAdminToken()
        && revision === getApiContextRevision() && sessionRevision === getAdminSessionRevision(),
      (state) => setSnapshot({ identity, state }),
    );
    current.current = recorder;
    return () => {
      disposed = true;
      if (current.current === recorder) current.current = null;
      void recorder.dispose();
    };
  }, [visible, conversationId, scopeKey, identity]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) => {
      // iOS permission sheets briefly become inactive. Actual backgrounding
      // cancels recording and invalidates a permission/prepare result in flight.
      if (next === 'background') {
        setSnapshot((previous) => ({ ...previous, state: IDLE }));
        void current.current?.cancel();
      }
    });
    return () => listener.remove();
  }, []);

  return {
    state: snapshot.identity === identity ? snapshot.state : IDLE,
    start: useCallback(() => current.current?.start() ?? Promise.resolve(), []),
    finish: useCallback(() => current.current?.finish() ?? Promise.resolve(null), []),
    cancel: useCallback(() => current.current?.cancel() ?? Promise.resolve(), []),
    getState: useCallback(() => current.current?.getState() ?? IDLE, []),
  };
}
