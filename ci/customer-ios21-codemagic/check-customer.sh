#!/bin/bash
set -euo pipefail
test -z "${CUSTOMER_IOS_P12_BASE64:-}" && test -z "${CUSTOMER_IOS_P12_PASSWORD:-}" && test -z "${CUSTOMER_IOS_PROFILE_BASE64:-}" && test -z "${CM_API_TOKEN:-}"
cd "$CM_BUILD_DIR/$CUSTOMER_APP_DIR"
# Expo normally creates this ignored declaration when the dev server starts.
# A clean CI checkout needs it before the first typecheck.
printf '/// <reference types="expo/types" />\n' > expo-env.d.ts
npx --no-install tsc --noEmit
# Seven customer suites reuse the exact lightweight shared test harness.
# It resolves TypeScript from this customer's locked install, without installing the admin app.
export NODE_PATH="$CM_BUILD_DIR/$CUSTOMER_APP_DIR/node_modules"
node --test "scripts/customer-*.test.cjs"
