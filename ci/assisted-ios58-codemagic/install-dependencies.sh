#!/bin/bash
set -euo pipefail
umask 077
test -z "${ASSISTED_IOS_P12_BASE64:-}" && test -z "${ASSISTED_IOS_P12_PASSWORD:-}" && test -z "${ASSISTED_IOS_PROFILE_BASE64:-}" && test -z "${CM_API_TOKEN:-}"
test -z "${APP_STORE_CONNECT_PRIVATE_KEY:-}" && test -z "${APP_STORE_CONNECT_API_KEY:-}" && test -z "${APP_STORE_CONNECT_KEY_IDENTIFIER:-}" && test -z "${APP_STORE_CONNECT_ISSUER_ID:-}"
node "$CM_BUILD_DIR/$ASSISTED_CI_DIR/verify-source.cjs"
cd "$CM_BUILD_DIR/$ASSISTED_APP_DIR"
npm ci --no-audit --no-fund
node "$CM_BUILD_DIR/$ASSISTED_CI_DIR/verify-source.cjs" --installed
