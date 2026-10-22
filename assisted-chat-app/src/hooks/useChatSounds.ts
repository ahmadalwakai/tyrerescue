import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { getApiContextRevision } from '@/lib/api';
import { createChatSoundTracker, type ChatSoundMessage } from '@/lib/chat-sound-tracker';

interface Options {
  visible: boolean;
  conversationId: string | null | undefined;
  scopeKey: string;
  currentUserId?: string | null;
}

type NativeSoundSession = ReturnType<typeof import('@/lib/notifications').createForegroundChatSoundSession>;
interface SoundScope {
  conversationId: string;
  revision: number;
  disposed: boolean;
  tracker: ReturnType<typeof createChatSoundTracker>;
  native: NativeSoundSession | null;
  nativeLoading: Promise<NativeSoundSession | null> | null;
  webAudio: HTMLAudioElement | null;
  webGeneration: number;
}

function stopScopeAudio(scope: SoundScope) {
  scope.webGeneration += 1;
  scope.native?.dispose();
  scope.native = null;
  scope.nativeLoading = null;
  if (scope.webAudio) {
    scope.webAudio.pause();
    scope.webAudio.removeAttribute('src');
    scope.webAudio.load();
    scope.webAudio = null;
  }
}

function isActive(scope: SoundScope) {
  return !scope.disposed && scope.revision === getApiContextRevision()
    && AppState.currentState === 'active'
    && (Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState === 'visible');
}

async function play(scope: SoundScope, kind: 'send' | 'receive') {
  if (!isActive(scope)) return;
  if (Platform.OS === 'web') {
    const generation = ++scope.webGeneration;
    try {
      // Both modules/assets are resolved only when a real foreground message
      // requires a tone. Browser autoplay restrictions are respected.
      const { Asset } = await import('expo-asset');
      if (!isActive(scope) || generation !== scope.webGeneration || typeof Audio === 'undefined') return;
      const sound = kind === 'send'
        // Metro requires literal asset require() calls to bundle media files.
         
        ? require('../../assets/sounds/chat-send.wav')
         
        : require('../../assets/sounds/chat-receive.wav');
      scope.webAudio?.pause();
      const audio = new Audio(Asset.fromModule(sound).uri);
      audio.volume = 0.5;
      scope.webAudio = audio;
      const cleanup = () => {
        if (scope.webAudio === audio) scope.webAudio = null;
        audio.removeAttribute('src');
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
      if (!isActive(scope) || generation !== scope.webGeneration) { audio.pause(); cleanup(); }
    } catch {
      // No permission prompt, forced autoplay, or failed-send UI for a tone.
    }
    return;
  }
  const generation = scope.webGeneration;
  try {
    if (!scope.nativeLoading && !scope.native) {
      scope.nativeLoading = import('@/lib/notifications').then((module) => {
        if (!isActive(scope) || generation !== scope.webGeneration) return null;
        const session = module.createForegroundChatSoundSession(() => isActive(scope) && generation === scope.webGeneration);
        scope.native = session;
        return session;
      }).catch(() => null);
    }
    const session = scope.native ?? await scope.nativeLoading;
    if (isActive(scope) && generation === scope.webGeneration) await session?.play(kind);
  } catch {
    // Optional sound support never affects sending/receiving messages.
  }
}

/** Call observeMessages after a successful guarded fetch, playSent after POST. */
export function useChatSounds({ visible, conversationId, scopeKey, currentUserId }: Options) {
  const current = useRef<SoundScope | null>(null);
  useLayoutEffect(() => {
    if (!visible || !conversationId) { current.current = null; return; }
    const scope: SoundScope = {
      conversationId, revision: getApiContextRevision(), disposed: false,
      tracker: createChatSoundTracker(currentUserId), native: null, nativeLoading: null,
      webAudio: null, webGeneration: 0,
    };
    current.current = scope;
    return () => {
      scope.disposed = true;
      scope.tracker.reset();
      stopScopeAudio(scope);
      if (current.current === scope) current.current = null;
    };
  }, [visible, conversationId, scopeKey, currentUserId]);

  useEffect(() => {
    const pause = () => {
      const scope = current.current;
      if (!scope) return;
      scope.tracker.reset();
      stopScopeAudio(scope);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') pause();
    });
    const visibilityChanged = () => { if (document.visibilityState !== 'visible') pause(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', visibilityChanged);
    }
    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityChanged);
      }
    };
  }, []);

  // Stable identities prevent chat polling/open effects from restarting when
  // a conversation ID arrives or the account/project changes.
  const observeMessages = useCallback((messages: readonly ChatSoundMessage[], requestedId?: string) => {
    const scope = current.current;
    if (!scope || (requestedId && requestedId !== scope.conversationId)) return;
    const incoming = scope.tracker.observe(messages);
    if (incoming && isActive(scope)) void play(scope, 'receive');
  }, []);
  const playSent = useCallback((messageId?: string) => {
    const scope = current.current;
    if (scope && isActive(scope) && scope.tracker.confirmSent(messageId)) void play(scope, 'send');
  }, []);
  return { observeMessages, playSent };
}
