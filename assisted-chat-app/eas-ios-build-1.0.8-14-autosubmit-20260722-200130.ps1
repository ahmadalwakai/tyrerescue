$env:EAS_BUILD_NO_EXPO_GO_WARNING='true'
$env:CI='1'
npx eas build --platform ios --profile production --auto-submit --non-interactive *> 'C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.8-14-autosubmit-20260722-200130.out.log'
$LASTEXITCODE | Set-Content -LiteralPath 'C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.8-14-autosubmit-20260722-200130.exit'
