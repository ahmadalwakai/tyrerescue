#!/bin/bash
set -euo pipefail
umask 077
test -z "${ASSISTED_IOS_P12_BASE64:-}" && test -z "${ASSISTED_IOS_P12_PASSWORD:-}" && test -z "${ASSISTED_IOS_PROFILE_BASE64:-}" && test -z "${CM_API_TOKEN:-}"
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
test "$(xcodebuild -version | head -n 1)" = 'Xcode 26.2'
test "$(xcodebuild -version | tail -n 1)" = 'Build version 17C52'
test "$(xcrun --sdk iphoneos --show-sdk-version)" = '26.2'
cd "$CM_BUILD_DIR/$ASSISTED_APP_DIR"
# Versioned Expo CLI is installed by npm ci; no EAS Build service is involved.
npx --no-install expo prebuild --platform ios --no-install --clean
printf 'export NODE_BINARY="%s"\n' "$(command -v node)" > ios/.xcode.env.local
cd ios
pod install --repo-update
python3 - <<'PY'
from pathlib import Path
ios = Path.cwd()
assert 'ExpoSecureStore (' in (ios / 'Podfile.lock').read_text(), 'SecureStore native pod is missing'
providers = list((ios / 'Pods').rglob('ExpoModulesProvider.swift'))
assert any('SecureStoreModule.self' in provider.read_text() for provider in providers), 'SecureStore native module is not registered'
PY
echo 'Native iOS generation and CocoaPods completed.'
