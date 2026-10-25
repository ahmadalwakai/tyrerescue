import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createChatSoundTracker, type ChatSoundMessage } from '../../assisted-chat-app/src/lib/chat-sound-tracker';

const source = fs.readFileSync(path.resolve(__dirname, '../../assisted-chat-app/src/hooks/useChatSounds.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;
interface Options { visible: boolean; conversationId: string | null; scopeKey: string }
interface Controls { observeMessages(messages: ChatSoundMessage[], requestedId?: string): void; playSent(messageId?: string): void }

function harness() {
  let cursor = 0;
  const state = { revision: 1, appState: 'active' };
  const slots: Array<{ value?: unknown; dependencies?: unknown[]; cleanup?: () => void }> = [];
  let appStateListener!: (state: string) => void;
  const nativeSessions: Array<{ play: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; current: () => boolean }> = [];
  const same = (a?: unknown[], b?: unknown[]) => Boolean(a && b && a.length === b.length && a.every((value, index) => value === b[index]));
  const effect = (callback: () => undefined | (() => void), dependencies: unknown[]) => {
    const index = cursor++; const previous = slots[index];
    if (same(previous?.dependencies, dependencies)) return;
    previous?.cleanup?.();
    slots[index] = { dependencies, cleanup: callback() };
  };
  const react = {
    useRef: (initial: unknown) => {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index].value;
    },
    useLayoutEffect: effect, useEffect: effect,
    useCallback: (callback: unknown, dependencies: unknown[]) => {
      const index = cursor++;
      if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { value: callback, dependencies };
      return slots[index].value;
    },
  };
  const fixture = { exports: {} };
  new vm.Script(compiled).runInNewContext({
    module: fixture, exports: fixture.exports,
    require: (id: string) => {
      if (id === 'react') return react;
      if (id === 'react-native') return { Platform: { OS: 'ios' }, AppState: {
        get currentState() { return state.appState; },
        addEventListener: (_: string, listener: typeof appStateListener) => { appStateListener = listener; return { remove: vi.fn() }; },
      } };
      if (id === '@/lib/api') return { getApiContextRevision: () => state.revision };
      if (id === '@/lib/chat-sound-tracker') return { createChatSoundTracker };
      if (id === '@/lib/notifications') return {
        createForegroundChatSoundSession: (current: () => boolean) => {
          const session = { current, play: vi.fn(async () => true), dispose: vi.fn() };
          nativeSessions.push(session); return session;
        },
      };
      throw new Error(`Unexpected sound hook test import ${id}`);
    },
  });
  const hook = fixture.exports as { useChatSounds(options: Options): Controls };
  return {
    state, nativeSessions,
    render(options: Options) { cursor = 0; return hook.useChatSounds(options); },
    foreground(value: string) { state.appState = value; appStateListener(value); },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}

const incoming = (id: string): ChatSoundMessage => ({ id, senderId: 'driver-1', senderRole: 'driver', messageType: 'text', createdAt: '2026-10-22T12:00:00Z' });

describe('chat sound hook lifecycle', () => {
  it('keeps callback identities stable while switching conversations and rejects a late old-conversation batch', async () => {
    const h = harness();
    const first = h.render({ visible: true, conversationId: 'chat-a', scopeKey: 'session-a' });
    first.observeMessages([], 'chat-a'); first.observeMessages([incoming('new-a')], 'chat-a');
    await vi.waitFor(() => expect(h.nativeSessions[0]?.play).toHaveBeenCalledWith('receive'));
    const second = h.render({ visible: true, conversationId: 'chat-b', scopeKey: 'session-a' });
    expect(second.observeMessages).toBe(first.observeMessages); expect(second.playSent).toBe(first.playSent);
    first.observeMessages([incoming('late-a')], 'chat-a');
    second.observeMessages([incoming('existing-b')], 'chat-b');
    expect(h.nativeSessions).toHaveLength(1);
    expect(h.nativeSessions[0].dispose).toHaveBeenCalledOnce();
    second.playSent('confirmed-send'); second.playSent('confirmed-send');
    await vi.waitFor(() => expect(h.nativeSessions[1]?.play).toHaveBeenCalledTimes(1));
    expect(h.nativeSessions[1].play).toHaveBeenCalledWith('send');
    h.unmount();
  });

  it('cancels lazy playback across a quick background/foreground transition', async () => {
    const h = harness(); const controls = h.render({ visible: true, conversationId: 'chat-a', scopeKey: 'session-a' });
    controls.playSent('confirmed-before-background');
    h.foreground('background'); h.foreground('active');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.nativeSessions).toHaveLength(0);
    controls.observeMessages([incoming('return-baseline')], 'chat-a');
    expect(h.nativeSessions).toHaveLength(0);
    controls.playSent('new-confirmed-after-return');
    await vi.waitFor(() => expect(h.nativeSessions[0]?.play).toHaveBeenCalledWith('send'));
    h.unmount();
  });

  it('never plays after API session changes, hiding chat, or unmounting', async () => {
    const h = harness(); const controls = h.render({ visible: true, conversationId: 'chat-a', scopeKey: 'session-a' });
    h.state.revision += 1;
    controls.playSent('stale-session');
    controls.observeMessages([], 'chat-a'); controls.observeMessages([incoming('new')], 'chat-a');
    expect(h.nativeSessions).toHaveLength(0);
    h.render({ visible: false, conversationId: 'chat-a', scopeKey: 'session-b' });
    controls.playSent('hidden');
    h.unmount(); controls.playSent('unmounted');
    await Promise.resolve(); await Promise.resolve();
    expect(h.nativeSessions).toHaveLength(0);
  });
});
