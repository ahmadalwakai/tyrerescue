// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/**',
      '.expo/**',
      'android/**',
      'node_modules/**',
      'scripts/**',
      'eas-setup-creds.js',
      'metro.config.js',
    ],
  },
]);
