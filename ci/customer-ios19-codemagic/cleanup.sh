#!/bin/bash
set -euo pipefail
# Every target is a fixed descendant of this unique Codemagic temporary directory.
test -n "${CUSTOMER_CI_TEMP:-}" && test -d "$CUSTOMER_CI_TEMP"
if test -f "$CUSTOMER_CI_TEMP/customer-ios19-signing/signing.keychain-db"; then
  security delete-keychain "$CUSTOMER_CI_TEMP/customer-ios19-signing/signing.keychain-db" >/dev/null 2>&1 || true
fi
if test -f "$CUSTOMER_CI_TEMP/customer-ios19-signing/installed-profile-path.txt"; then
  profile_path="$(cat "$CUSTOMER_CI_TEMP/customer-ios19-signing/installed-profile-path.txt")"
  case "$profile_path" in
    "$HOME/Library/MobileDevice/Provisioning Profiles/customer-ios19-"*.mobileprovision) rm -f -- "$profile_path" ;;
    *) echo 'Refusing an unexpected profile cleanup path.' >&2; exit 1 ;;
  esac
fi
rm -rf -- "$CUSTOMER_CI_TEMP/customer-ios19-signing" "$CUSTOMER_CI_TEMP/customer-ios19-work"
echo 'Temporary signing files and build logs removed.'
