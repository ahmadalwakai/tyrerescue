$ErrorActionPreference = 'Continue'
& npx.cmd eas build --platform ios --profile production --auto-submit-with-profile production --what-to-test "Assisted Chat latest operator workflow fixes." --non-interactive --wait --message "Assisted Chat workflow fixes 1.0.2(8)" 1> "C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.2-8-autosubmit-20260719-020502.out.log" 2> "C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.2-8-autosubmit-20260719-020502.err.log"
$LASTEXITCODE | Set-Content -Path "C:\tyrerescue\assisted-chat-app\eas-ios-build-1.0.2-8-autosubmit-20260719-020502.exit" -NoNewline
