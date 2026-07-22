/* eslint-disable @typescript-eslint/no-require-imports */

require('@expo/metro-runtime');

const {
  logStartupCheckpoint,
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} = require('./lib/startup-logging');

logStartupCheckpoint('Native app started', { source: 'js-entry' });
logStartupModuleStarted('JS runtime');
logStartupCheckpoint('JS runtime started');
logStartupModuleCompleted('JS runtime');

logStartupModuleStarted('Expo Router entry');
try {
  require('expo-router/entry');
  logStartupModuleCompleted('Expo Router entry');
} catch (error) {
  logStartupModuleFailed('Expo Router entry', error);
  throw error;
}
