#!/bin/bash
set -euo pipefail
umask 077
test "$(uname -s)" = Darwin
test "$(uname -m)" = x86_64
test "$(xcodebuild -version | head -n 1)" = 'Xcode 26.2'
test "$(xcodebuild -version | tail -n 1)" = 'Build version 17C52'
test "$(xcrun --sdk iphoneos --show-sdk-version)" = '26.2'
cd "$GITHUB_WORKSPACE/$ASSISTED_APP_DIR"
# Versioned Expo CLI is installed by npm ci; no EAS Build service is involved.
npx --no-install expo prebuild --platform ios --no-install --clean
printf 'export NODE_BINARY="%s"\n' "$(command -v node)" > ios/.xcode.env.local
cd ios
pod install --repo-update
echo 'Native iOS generation and CocoaPods completed.'
