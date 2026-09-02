$ErrorActionPreference = 'Continue'
$env:EAS_BUILD_NO_EXPO_GO_WARNING = 'true'
$env:CI = '1'
npx eas build --platform ios --profile production --auto-submit --non-interactive 2>&1 | Tee-Object -FilePath 'C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.9-16-autosubmit-20260722-223212.out.log'
$code = $LASTEXITCODE
Set-Content -Path 'C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.9-16-autosubmit-20260722-223212.exit' -Value $code
exit $code
