import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Local `vercel build` output (one full .next build per folder).
    ".vercel/**",
    // Build output of any nested app.
    "**/.next/**",
    "**/dist/**",
    // Separate apps with their own toolchains (same set tsconfig.next.json excludes).
    "driver-app/**",
    "admin-app/**",
    "assisted-chat-app/**",
    "stock-app/**",
    "edinburgh-tyre-fitting/**",
    "247moglasgow/**",
    "tyre-rescue/**",
    "builds/**",
    "out/**",
    "build/**",
    "artifacts/**",
    ".tmp*/**",
    "tmp-chrome*/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
