#!/bin/bash
set -euo pipefail
umask 077
test -z "${DRIVER_IOS_P12_BASE64:-}" && test -z "${DRIVER_IOS_P12_PASSWORD:-}" && test -z "${DRIVER_IOS_PROFILE_BASE64:-}" && test -z "${CM_API_TOKEN:-}"
node "$CM_BUILD_DIR/$DRIVER_CI_DIR/verify-source.cjs"
cd "$CM_BUILD_DIR/$DRIVER_APP_DIR"
npm ci --no-audit --no-fund
node "$CM_BUILD_DIR/$DRIVER_CI_DIR/verify-source.cjs" --installed
