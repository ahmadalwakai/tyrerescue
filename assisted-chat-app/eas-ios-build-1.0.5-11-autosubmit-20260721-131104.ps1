$env:EAS_BUILD_NO_EXPO_GO_WARNING='true'
$env:CI='1'
npx eas build --platform ios --profile production --auto-submit --non-interactive
$LASTEXITCODE | Set-Content -Path 'eas-ios-build-1.0.5-11-autosubmit-20260721-131104.exit'
