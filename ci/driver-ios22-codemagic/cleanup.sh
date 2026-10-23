#!/bin/bash
set -euo pipefail
# Every target is a fixed descendant of this unique Codemagic temporary directory.
test -n "${DRIVER_CI_TEMP:-}" && test -d "$DRIVER_CI_TEMP"
if test -f "$DRIVER_CI_TEMP/driver-ios22-signing/signing.keychain-db"; then
  security delete-keychain "$DRIVER_CI_TEMP/driver-ios22-signing/signing.keychain-db" >/dev/null 2>&1 || true
fi
if test -f "$DRIVER_CI_TEMP/driver-ios22-signing/installed-profile-path.txt"; then
  profile_path="$(cat "$DRIVER_CI_TEMP/driver-ios22-signing/installed-profile-path.txt")"
  case "$profile_path" in
    "$HOME/Library/MobileDevice/Provisioning Profiles/driver-ios22-"*.mobileprovision) rm -f -- "$profile_path" ;;
    *) echo 'Refusing an unexpected profile cleanup path.' >&2; exit 1 ;;
  esac
fi
rm -rf -- "$DRIVER_CI_TEMP/driver-ios22-signing" "$DRIVER_CI_TEMP/driver-ios22-work"
echo 'Temporary signing files and build logs removed.'
