/* eslint-disable @typescript-eslint/no-require-imports */

require('@expo/metro-runtime');

const {
  logStartupCheckpoint,
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} = require('./lib/startup-logging');

const STARTUP_ERROR_HANDLER_STATE_KEY = '__TYRE_RESCUE_STARTUP_ERROR_HANDLERS__';

function getHandlerState() {
  if (!globalThis[STARTUP_ERROR_HANDLER_STATE_KEY]) {
    globalThis[STARTUP_ERROR_HANDLER_STATE_KEY] = {
      globalHandlerInstalled: false,
      promiseTrackingInstalled: false,
      handlingGlobalError: false,
      handlingPromiseRejection: false,
      previousGlobalHandler: null,
      previousUnhandledRejection: null,
      previousPromiseOnUnhandled: null,
      previousPromiseOnHandled: null,
    };
  }
  return globalThis[STARTUP_ERROR_HANDLER_STATE_KEY];
}

const handlerState = getHandlerState();

function safeLogStartupFailure(label, error, details) {
  try {
    logStartupModuleFailed(label, error, details);
  } catch {
    // Error handlers must never crash while recording the crash.
  }
}

function delegateToOriginalGlobalHandler(error, isFatal) {
  const previousGlobalHandler = handlerState.previousGlobalHandler;
  if (typeof previousGlobalHandler === 'function') {
    try {
      previousGlobalHandler(error, isFatal);
    } catch (delegateError) {
      safeLogStartupFailure('global.javascript.error.delegate.failed', delegateError, {
        isFatal: Boolean(isFatal),
      });
      if (isFatal) {
        throw delegateError;
      }
    }
    return;
  }

  if (isFatal) {
    throw error;
  }

  try {
    console.error(error);
  } catch {
    // Console logging must never become the fatal path.
  }
}

function installGlobalErrorHandler() {
  if (handlerState.globalHandlerInstalled) return;
  const errorUtils = globalThis.ErrorUtils;
  if (!errorUtils || typeof errorUtils.setGlobalHandler !== 'function') return;
  handlerState.previousGlobalHandler =
    typeof errorUtils.getGlobalHandler === 'function'
      ? errorUtils.getGlobalHandler()
      : null;
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (handlerState.handlingGlobalError) {
      delegateToOriginalGlobalHandler(error, isFatal);
      return;
    }
    handlerState.handlingGlobalError = true;
    try {
      safeLogStartupFailure('global.javascript.error', error, {
        isFatal: Boolean(isFatal),
      });
      delegateToOriginalGlobalHandler(error, isFatal);
    } finally {
      handlerState.handlingGlobalError = false;
    }
  });
  handlerState.globalHandlerInstalled = true;
}

function handleUnhandledPromiseRejection(id, rejection) {
  if (handlerState.handlingPromiseRejection) return;
  handlerState.handlingPromiseRejection = true;
  try {
    safeLogStartupFailure('global.unhandled_promise_rejection', rejection, {
      id: typeof id === 'number' ? id : undefined,
    });
  } finally {
    handlerState.handlingPromiseRejection = false;
  }
}

function installPromiseRejectionTracking() {
  if (handlerState.promiseTrackingInstalled) return;
  handlerState.promiseTrackingInstalled = true;

  try {
    const optionsModule = require('react-native/Libraries/promiseRejectionTrackingOptions');
    const options = optionsModule && (optionsModule.default || optionsModule);
    if (options && typeof options === 'object') {
      handlerState.previousPromiseOnUnhandled = options.onUnhandled;
      handlerState.previousPromiseOnHandled = options.onHandled;
      options.onUnhandled = (id, rejection) => {
        handleUnhandledPromiseRejection(id, rejection);
        if (typeof handlerState.previousPromiseOnUnhandled === 'function') {
          return handlerState.previousPromiseOnUnhandled(id, rejection);
        }
        return undefined;
      };

      const hermes = globalThis.HermesInternal;
      if (
        hermes &&
        typeof hermes.hasPromise === 'function' &&
        hermes.hasPromise() &&
        typeof hermes.enablePromiseRejectionTracker === 'function'
      ) {
        hermes.enablePromiseRejectionTracker(options);
      }
    }
  } catch (error) {
    safeLogStartupFailure('global.promise_rejection_tracking.install.failed', error);
  }

  handlerState.previousUnhandledRejection = globalThis.onunhandledrejection;
  globalThis.onunhandledrejection = (event) => {
    const reason = event && 'reason' in event ? event.reason : event;
    handleUnhandledPromiseRejection(undefined, reason);
    if (typeof handlerState.previousUnhandledRejection === 'function') {
      return handlerState.previousUnhandledRejection.call(globalThis, event);
    }
    return undefined;
  };
}

installGlobalErrorHandler();
installPromiseRejectionTracking();

try {
  logStartupCheckpoint('Global error handlers installed', {
    errorUtils: Boolean(globalThis.ErrorUtils),
    promiseRejectionOptions: true,
  });
} catch {
  // Startup logging is best-effort only.
}

logStartupCheckpoint('Native app started', { source: 'js-entry' });
logStartupModuleStarted('JS runtime');
logStartupCheckpoint('JS runtime started');
logStartupModuleCompleted('JS runtime');

logStartupModuleStarted('Expo Router entry');
try {
  require('expo-router/entry');
  logStartupModuleCompleted('Expo Router entry');
} catch (error) {
  safeLogStartupFailure('Expo Router entry', error);
  throw error;
}
