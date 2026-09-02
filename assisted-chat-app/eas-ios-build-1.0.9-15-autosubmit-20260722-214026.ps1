$ErrorActionPreference = 'Continue'
npx eas build --platform ios --profile production --auto-submit --non-interactive 2>&1 | Tee-Object -FilePath 'C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.9-15-autosubmit-20260722-214026.out.log'
$code = $LASTEXITCODE
Set-Content -Path 'C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.9-15-autosubmit-20260722-214026.exit' -Value $code
exit $code
