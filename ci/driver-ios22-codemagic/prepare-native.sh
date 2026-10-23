#!/bin/bash
set -euo pipefail
umask 077
test -z "${DRIVER_IOS_P12_BASE64:-}" && test -z "${DRIVER_IOS_P12_PASSWORD:-}" && test -z "${DRIVER_IOS_PROFILE_BASE64:-}" && test -z "${CM_API_TOKEN:-}"
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
test "$(xcodebuild -version | head -n 1)" = 'Xcode 26.2'
test "$(xcodebuild -version | tail -n 1)" = 'Build version 17C52'
test "$(xcrun --sdk iphoneos --show-sdk-version)" = '26.2'
ruby -c "$CM_BUILD_DIR/$DRIVER_CI_DIR/configure-signing.rb"
cd "$CM_BUILD_DIR/$DRIVER_APP_DIR"
# Preserve the frozen app.json bytes and apply the new iOS build number
# only in this disposable CI copy; the actual app version is already 1.3.1.
test ! -e app.config.cjs
cat > app.config.cjs <<'JS'
module.exports = ({ config }) => ({
  ...config,
  ios: { ...config.ios, buildNumber: '22' },
});
JS
# Versioned Expo CLI is installed by npm ci; no EAS Build service is involved.
npx --no-install expo prebuild --platform ios --no-install --clean
printf 'export NODE_BINARY="%s"\n' "$(command -v node)" > ios/.xcode.env.local
cd ios
pod install --repo-update
python3 "$CM_BUILD_DIR/$DRIVER_CI_DIR/verify-native.py"
echo 'Native iOS generation and CocoaPods completed.'
