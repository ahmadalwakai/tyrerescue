import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { ModalPresentationController } from '../../assisted-chat-app/src/lib/modal-presentation';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, 'assisted-chat-app/src/components', file), 'utf8');
const screen = read('AssistedChatScreen.tsx');
type Element = { type: string; props: Record<string, unknown> };

function functionHarness(name: string, platform = 'ios') {
  const ast = ts.createSourceFile('screen.tsx', screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!declaration) throw new Error(`Missing function ${name}`);
  const compiled = ts.transpileModule(`${declaration.getText(ast)}\nexports.render = ${name};`, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const refs: Array<{ current: unknown }> = [];
  let cursor = 0;
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  const fixture = { exports: {} as { render(props: Record<string, unknown>): Element | null } };
  new vm.Script(compiled).runInNewContext({
    exports: fixture.exports,
    useRef: (initial: unknown) => { const index = cursor++; refs[index] ??= { current: initial }; return refs[index]; },
    useState: (initial: unknown) => {
      const index = cursor++; refs[index] ??= { current: initial };
      return [refs[index].current, (next: unknown) => { refs[index].current = next; }];
    },
    useEffect: (effect: () => void) => { effect(); },
    Platform: { OS: platform },
    Modal: 'Modal', Pressable: 'Pressable', View: 'View', Text: 'Text', ScrollView: 'ScrollView',
    AppButton: 'AppButton', AppIcon: 'AppIcon', AdminAccountModal: 'AdminAccountModal',
    styles: {}, colors: {}, iconForSheetAction: () => 'comments',
    requireStartupModule: (_: string, load: () => unknown) => load(),
    require: (id: string) => id === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : {
      ChatHubModal: 'ChatHubModal', DriverChatModal: 'DriverChatModal',
    },
  });
  return (props: Record<string, unknown>) => { cursor = 0; return fixture.exports.render(props); };
}

function descendants(element: unknown): Element[] {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(descendants);
  const node = element as Element;
  return [node, ...descendants(node.props?.children)];
}

describe('iOS primary modal ownership', () => {
  it('keeps ownership throughout animated dismissal and ignores rapid repeated taps', () => {
    const controller = new ModalPresentationController();
    expect(controller.open('chat')).toBe(true);
    expect(controller.open('chat')).toBe(false);
    expect(controller.open('account')).toBe(false);
    expect(controller.close('chat', true)).toBe(true);
    expect(controller.getState()).toEqual({ owner: 'chat', closing: true });
    expect(controller.open('account')).toBe(false);
    expect(controller.close('chat', true)).toBe(false);
    controller.didDismiss('chat');
    expect(controller.getState().owner).toBeNull();
    expect(controller.open('account')).toBe(true);
  });

  it('ignores a different presenter and stale dismissal callbacks', () => {
    const controller = new ModalPresentationController();
    controller.open('account');
    expect(controller.close('chat', true)).toBe(false);
    controller.didDismiss('account');
    expect(controller.getState().owner).toBe('account');
    controller.close('account', true);
    controller.didDismiss('chat');
    expect(controller.getState().owner).toBe('account');
    controller.didDismiss('account');
    controller.open('driver-chat');
    controller.didDismiss('account');
    expect(controller.getState().owner).toBe('driver-chat');
  });

  it('releases immediately on platforms without the iOS dismissal callback', () => {
    const controller = new ModalPresentationController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.open('chat');
    controller.close('chat', false);
    expect(controller.getState()).toEqual({ owner: null, closing: false });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    controller.open('account');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('retained native modal hosts', () => {
  for (const name of ['DeferredChatHubModal', 'DeferredDriverChatModal', 'RetainedAdminAccountModal']) {
    it(`${name} loads on first open and stays mounted with visible=false on close`, () => {
      const render = functionHarness(name);
      expect(render({ visible: false })).toBeNull();
      const open = render({ visible: true });
      expect(open?.props.visible).toBe(true);
      const closed = render({ visible: false });
      expect(closed?.type).toBe(open?.type);
      expect(closed?.props.visible).toBe(false);
      expect(render({ visible: true })?.type).toBe(open?.type);
    });
  }

  it('uses one fullscreen native presenter per chat and renders message tools and photo previews inside it', () => {
    for (const file of ['ChatHubModal.tsx', 'DriverChatModal.tsx']) {
      const source = read(file);
      expect(source.match(/<Modal\b/g)).toHaveLength(1);
      expect(source).toContain('presentationStyle="fullScreen"');
      expect(source).toContain('onDismiss={onDismiss}');
      expect(source).toContain('<ChatPhotoPreview uri={previewUri}');
      expect(source).toContain('<MessageActionsOverlay');
      expect(source).toContain('<EditMessageOverlay');
    }
    expect(read('ChatImageBubble.tsx')).not.toMatch(/<Modal\b/);
    expect(read('AdminAccountModal.tsx')).toContain('<Modal visible={visible} presentationStyle="fullScreen"');
    expect(screen).not.toMatch(/<Deferred(?:ChatHub|DriverChat)Modal\s+key=/);
  });

  it('defers automatic alerts and removes the duplicate driver chat shortcut', () => {
    expect(screen).toContain('visible={urgentPopupOpen && !operatorModalActive}');
    expect(screen).toContain('driverJourneys.visible && !urgentPopupOpen && !operatorModalActive');
    expect(screen).toContain('Boolean(primaryPresentation.owner');
    expect(screen).toContain('moreOpen || moreDismissing');
    expect(read('alerts/DriverJourneysModal.tsx')).toContain('Boolean(journeys.visible && selected && !selected.isRead');
    expect(screen).not.toContain('assisted-chat-driver-chat-shortcut');
    expect(screen).not.toContain('handleStartDriverChat');
    expect(read('ChatHubModal.tsx')).toContain('openDriverConversation(driver)');
  });
});

describe('More menu native transition', () => {
  it('runs the selected destination once only after iOS onDismiss', () => {
    const render = functionHarness('GuidedActionSheet');
    const onClose = vi.fn();
    const onPress = vi.fn();
    const menu = render({ visible: true, title: 'More', onClose, actions: [{ id: 'chat', label: 'Messages', onPress }] });
    const action = descendants(menu).find((node) => node.props?.accessibilityRole === 'button');
    (action?.props.onPress as () => void)();
    (action?.props.onPress as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    (menu?.props.onDismiss as () => void)();
    (menu?.props.onDismiss as () => void)();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('opens the selected destination immediately on web', () => {
    const render = functionHarness('GuidedActionSheet', 'web');
    const onPress = vi.fn();
    const menu = render({ visible: true, title: 'More', onClose: vi.fn(), actions: [{ id: 'chat', label: 'Messages', onPress }] });
    const action = descendants(menu).find((node) => node.props?.accessibilityRole === 'button');
    (action?.props.onPress as () => void)();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
