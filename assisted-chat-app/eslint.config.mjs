import sharedConfig from '../eslint.config.mjs';

const config = [
  ...sharedConfig,
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      // Metro resolves static native assets with literal require calls.
      '@typescript-eslint/no-require-imports': ['error', {
        allow: ['\\.(?:png|jpe?g|gif|webp|wav|mp3|m4a)$'],
      }],
      // React Native Image uses accessibilityLabel rather than an HTML alt
      // attribute. Keep the accessibility rule active for actual web elements.
      'jsx-a11y/alt-text': ['warn', {
        elements: ['img', 'object', 'area', 'input[type="image"]'],
      }],
      // Remaining hits are load-on-open and reset-on-prop-change effects: an
      // extra render, not a wrong result, and this app does not enable the
      // React Compiler. Kept visible as warnings to burn down while the large
      // screens are split; the correctness rules (refs, purity, immutability,
      // preserve-manual-memoization) stay errors.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['scripts/**/*.{js,cjs}', '*.config.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      // These files run in Node and intentionally load CommonJS modules;
      // isolated test harnesses also create their own module/exports objects.
      '@typescript-eslint/no-require-imports': 'off',
      '@next/next/no-assign-module-variable': 'off',
    },
  },
];

export default config;
