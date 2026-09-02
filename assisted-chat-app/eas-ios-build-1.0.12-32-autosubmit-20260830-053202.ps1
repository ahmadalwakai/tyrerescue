$ErrorActionPreference = 'Continue'
$env:EAS_BUILD_NO_EXPO_GO_WARNING = 'true'
$env:CI = '1'
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logBase = "C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.12-32-autosubmit-$timestamp"
Set-Location "C:\tyrerescue\assisted-chat-app"
npx eas build --platform ios --profile production --auto-submit --non-interactive --wait --message "Bug fixes: parseInt radix, duplicate GBP formatter, motion animation, booking flow animations" 2>&1 | Tee-Object -FilePath "$logBase.full.log"
$code = $LASTEXITCODE
Set-Content -Path "$logBase.exit" -Value $code
exit $code
