#!/bin/bash
set -euo pipefail
test -z "${ASSISTED_IOS_P12_BASE64:-}" && test -z "${ASSISTED_IOS_P12_PASSWORD:-}" && test -z "${ASSISTED_IOS_PROFILE_BASE64:-}" && test -z "${CM_API_TOKEN:-}"
test -z "${APP_STORE_CONNECT_PRIVATE_KEY:-}" && test -z "${APP_STORE_CONNECT_API_KEY:-}" && test -z "${APP_STORE_CONNECT_KEY_IDENTIFIER:-}" && test -z "${APP_STORE_CONNECT_ISSUER_ID:-}"
cd "$CM_BUILD_DIR/$ASSISTED_APP_DIR"
npm run typecheck
node --test --test-concurrency=2 "scripts/*.test.cjs"
npm run test:notification-contract
npm run test:ios-notification-startup-config
