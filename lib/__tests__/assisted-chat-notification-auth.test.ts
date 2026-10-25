import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { parseCallbackNotificationOpenRequest, parseCustomerChatNotificationOpenRequest } from '../../assisted-chat-app/src/lib/notification-safety';
import { ModalPresentationController } from '../../assisted-chat-app/src/lib/modal-presentation';

const source = readFileSync(path.resolve(__dirname, '../../assisted-chat-app/src/components/AssistedChatScreen.tsx'), 'utf8');
const ast = ts.createSourceFile('AssistedChatScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'AssistedChatScreen');
if (!screen?.body) throw new Error('Missing protected administrator screen');

function notificationFunctions() {
  let handler: ts.ArrowFunction | undefined;
  let presenter: ts.ArrowFunction | undefined;
  for (const statement of screen!.body!.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.name.getText(ast) === 'handleNotificationOpenData' && declaration.initializer && ts.isCallExpression(declaration.initializer)) {
          handler = declaration.initializer.arguments[0] as ts.ArrowFunction;
        }
      }
    }
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(ast) === 'useEffect') {
      const callback = statement.expression.arguments[0];
      if (ts.isArrowFunction(callback) && callback.body.getText(ast).includes('setChatHubOpen(true)') && callback.body.getText(ast).includes('pendingChatNotification')) presenter = callback;
    }
  }
  if (!handler || !presenter) throw new Error('Missing notification handler or chat presenter');
  return ts.transpileModule(`exports.handle = ${handler.getText(ast)}; exports.present = ${presenter.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const compiled = notificationFunctions();
const conversationId = '10000000-0000-4000-8000-000000000001';

function harness(options: { authenticated?: boolean; pending?: boolean } = {}) {
  const api = { hasAdminToken: options.authenticated ?? true };
  const modal = new ModalPresentationController();
  const context = {
    exports: {} as { handle(data: unknown): void; present(): void }, api,
    parseCallbackNotificationOpenRequest, parseCustomerChatNotificationOpenRequest,
    getApiContextRevision: () => 3, getAdminSessionRevision: () => 5,
    setPendingChatNotification: vi.fn(), setChatNotificationTarget: vi.fn(), setChatHubOpen: vi.fn(),
    pendingChatNotification: options.pending === false ? null : { conversationId, apiRevision: 3, sessionRevision: 5 },
    hydrated: true, operatorModalActive: false, urgentPopupOpen: false, driverJourneys: { visible: false }, modalPresentation: modal,
    getDriverJourneyNotificationOpenRequest: () => null, getUrgentBookingNotificationOpenRequest: () => null,
    lastCallbackNotificationRef: { current: null }, setPendingCallbackNotification: vi.fn(), logStartupCheckpoint: vi.fn(),
  };
  new vm.Script(compiled).runInNewContext(context);
  return { context, api, modal, handle: context.exports.handle, present: context.exports.present };
}

describe('protected administrator chat notification presentation', () => {
  it('does not enqueue a push before administrator authentication', () => {
    const h = harness({ authenticated: false });
    h.handle({ type: 'chat_message', conversationId });
    expect(h.context.setPendingChatNotification).not.toHaveBeenCalled();
    h.api.hasAdminToken = true;
    h.handle({ type: 'chat_message', conversationId });
    expect(h.context.setPendingChatNotification).toHaveBeenCalledExactlyOnceWith({ conversationId, apiRevision: 3, sessionRevision: 5 });
  });

  it('discards an already queued chat if the administrator token disappears', () => {
    const h = harness();
    h.api.hasAdminToken = false;
    h.present();
    expect(h.context.setPendingChatNotification).toHaveBeenCalledExactlyOnceWith(null);
    expect(h.context.setChatHubOpen).not.toHaveBeenCalled();
    expect(h.modal.getState().owner).toBeNull();
  });

  it('waits through UIKit dismissal and opens once only with the current authenticated scope', () => {
    const h = harness();
    h.modal.open('account'); h.modal.close('account', true);
    h.context.operatorModalActive = true;
    h.present();
    expect(h.context.setChatHubOpen).not.toHaveBeenCalled();
    h.modal.didDismiss('account');
    h.context.operatorModalActive = false;
    h.present(); h.present();
    expect(h.context.setChatHubOpen).toHaveBeenCalledExactlyOnceWith(true);
    expect(h.modal.getState().owner).toBe('chat');
    const stale = harness();
    stale.context.pendingChatNotification = { conversationId, apiRevision: 2, sessionRevision: 5 };
    stale.present();
    expect(stale.context.setPendingChatNotification).toHaveBeenCalledExactlyOnceWith(null);
    expect(stale.context.setChatHubOpen).not.toHaveBeenCalled();
  });
});
