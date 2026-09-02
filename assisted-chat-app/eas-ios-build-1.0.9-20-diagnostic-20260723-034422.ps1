$ErrorActionPreference = 'Continue'
$env:EAS_BUILD_NO_EXPO_GO_WARNING = 'true'
$env:CI = '1'
$env:EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP = 'true'
npx eas build --platform ios --profile production --auto-submit --non-interactive --wait --message "Assisted Chat diagnostic Build 20 - notification startup disabled" 2>&1 | Tee-Object -FilePath 'C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.9-20-diagnostic-20260723-034422.out.log'
$code = $LASTEXITCODE
Set-Content -Path 'C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.9-20-diagnostic-20260723-034422.exit' -Value $code
exit $code
