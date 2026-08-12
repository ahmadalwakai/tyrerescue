import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'react-native': path.resolve(__dirname, 'lib/__tests__/mocks/react-native.ts'),
      'expo-constants': path.resolve(__dirname, 'lib/__tests__/mocks/expo-constants.ts'),
      'expo-device': path.resolve(__dirname, 'lib/__tests__/mocks/expo-device.ts'),
      'expo-notifications': path.resolve(__dirname, 'lib/__tests__/mocks/expo-notifications.ts'),
      'server-only': path.resolve(__dirname, 'lib/__tests__/mocks/server-only.ts'),
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        'lib/__tests__/mocks/async-storage.ts',
      ),
    },
  },
});
