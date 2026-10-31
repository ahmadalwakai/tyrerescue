#!/bin/bash
set -euo pipefail
test -z "${CUSTOMER_IOS_P12_BASE64:-}" && test -z "${CUSTOMER_IOS_P12_PASSWORD:-}" && test -z "${CUSTOMER_IOS_PROFILE_BASE64:-}" && test -z "${CUSTOMER_IOS_LIVE_ACTIVITY_PROFILE_BASE64:-}" && test -z "${CM_API_TOKEN:-}"
test -z "${APP_STORE_CONNECT_PRIVATE_KEY:-}" && test -z "${APP_STORE_CONNECT_API_KEY:-}" && test -z "${APP_STORE_CONNECT_KEY_IDENTIFIER:-}" && test -z "${APP_STORE_CONNECT_ISSUER_ID:-}"
cd "$CM_BUILD_DIR/$CUSTOMER_APP_DIR"
# Expo normally creates this ignored declaration when the dev server starts.
# A clean CI checkout needs it before the first typecheck.
printf '/// <reference types="expo/types" />\n' > expo-env.d.ts
npx --no-install tsc --noEmit
npx --no-install eslint app src components constants hooks modules plugins app.config.ts
# Customer suites reuse these exact lightweight fixtures from the release commit.
# NODE_PATH resolves their TypeScript dependency from the locked customer install.
test -f "$CM_BUILD_DIR/assisted-chat-app/scripts/chat-modals.test.cjs"
test -f "$CM_BUILD_DIR/assisted-chat-app/src/components/theme.ts"
test -f "$CM_BUILD_DIR/assisted-chat-app/src/lib/chat-message-display.ts"
export NODE_PATH="$PWD/node_modules"
node --test scripts/customer-*.test.cjs
python3 -B "$CM_BUILD_DIR/$CUSTOMER_CI_DIR/signing-policy.test.py"
