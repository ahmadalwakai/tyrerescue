#!/bin/bash
set -euo pipefail
# Every target is a fixed descendant of this unique Codemagic temporary directory.
test -n "${ASSISTED_CI_TEMP:-}" && test -d "$ASSISTED_CI_TEMP"
if test -f "$ASSISTED_CI_TEMP/assisted-ios55-signing/signing.keychain-db"; then
  security delete-keychain "$ASSISTED_CI_TEMP/assisted-ios55-signing/signing.keychain-db" >/dev/null 2>&1 || true
fi
if test -f "$ASSISTED_CI_TEMP/assisted-ios55-signing/installed-profile-path.txt"; then
  profile_path="$(cat "$ASSISTED_CI_TEMP/assisted-ios55-signing/installed-profile-path.txt")"
  case "$profile_path" in
    "$HOME/Library/MobileDevice/Provisioning Profiles/assisted-ios55-"*.mobileprovision) rm -f -- "$profile_path" ;;
    *) echo 'Refusing an unexpected profile cleanup path.' >&2; exit 1 ;;
  esac
fi
rm -rf -- "$ASSISTED_CI_TEMP/assisted-ios55-signing" "$ASSISTED_CI_TEMP/assisted-ios55-work"
echo 'Temporary signing files and build logs removed.'
