#!/bin/bash
set -euo pipefail
umask 077
ci_dir="$GITHUB_WORKSPACE/$ASSISTED_CI_DIR"
signing="$RUNNER_TEMP/assisted-ios49-signing"
work="$RUNNER_TEMP/assisted-ios49-work"
output="$RUNNER_TEMP/assisted-ios49-output"
test ! -e "$work" && test ! -e "$output"
mkdir -m 700 "$work" "$output"
trap 'bash "$ci_dir/cleanup.sh"' EXIT

# Secrets first enter the runner only after dependency installation and prebuild.
python3 "$ci_dir/prepare-signing.py"
keychain="$signing/signing.keychain-db"
keychain_password="$(cat "$signing/keychain-password.txt")"
security create-keychain -p "$keychain_password" "$keychain" >/dev/null 2>&1
security set-keychain-settings -lut 10800 "$keychain" >/dev/null 2>&1
security unlock-keychain -p "$keychain_password" "$keychain" >/dev/null 2>&1
security import "$signing/distribution.p12" -P "$ASSISTED_IOS_P12_PASSWORD" -A -t cert -f pkcs12 -k "$keychain" > "$work/keychain-import.log" 2>&1
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$keychain_password" "$keychain" > "$work/keychain-partition.log" 2>&1
security list-keychains -d user -s "$keychain" "$HOME/Library/Keychains/login.keychain-db" >/dev/null 2>&1
security find-identity -v -p codesigning "$keychain" > "$signing/identities.txt"
python3 - <<'PY'
import json, os
from pathlib import Path
p = Path(os.environ['RUNNER_TEMP']) / 'assisted-ios49-signing'
meta = json.loads((p / 'metadata.json').read_text())
assert meta['certificateSha1'] in (p / 'identities.txt').read_text(), 'The imported signing identity is unavailable'
PY
unset ASSISTED_IOS_P12_BASE64 ASSISTED_IOS_P12_PASSWORD ASSISTED_IOS_PROFILE_BASE64 keychain_password
rm -f -- "$signing/distribution.p12" "$signing/keychain-password.txt"
ruby "$ci_dir/configure-signing.rb"
workspace="$(python3 -c 'import json,os; print(json.load(open(os.path.join(os.environ["RUNNER_TEMP"],"assisted-ios49-signing/xcode-target.json")))["workspace"])')"
scheme="$(python3 -c 'import json,os; print(json.load(open(os.path.join(os.environ["RUNNER_TEMP"],"assisted-ios49-signing/xcode-target.json")))["scheme"])')"

run_logged() {
  local stage="$1"; shift
  if "$@" > "$work/$stage.log" 2>&1; then
    echo "$stage completed."
  else
    # Public log contains bounded compiler diagnostics with credentials/tokens scrubbed.
    python3 "$ci_dir/sanitize-failure.py" "$stage" "$work/$stage.log"
    return 1
  fi
}

run_logged archive xcodebuild -workspace "$workspace" -scheme "$scheme" -configuration Release -destination 'generic/platform=iOS' -archivePath "$work/AssistedChat.xcarchive" -derivedDataPath "$work/DerivedData" -resultBundlePath "$work/ArchiveResult.xcresult" archive

python3 - <<'PY'
import json, os, plistlib
from pathlib import Path
t = Path(os.environ['RUNNER_TEMP'])
m = json.loads((t / 'assisted-ios49-signing/metadata.json').read_text())
options = {'method': 'app-store-connect', 'destination': 'export', 'signingStyle': 'manual', 'teamID': m['team'], 'signingCertificate': m['certificateSha1'], 'provisioningProfiles': {m['bundle']: m['uuid']}, 'manageAppVersionAndBuildNumber': False, 'stripSwiftSymbols': True, 'uploadSymbols': False}
(t / 'assisted-ios49-work/ExportOptions.plist').write_bytes(plistlib.dumps(options))
PY
run_logged export xcodebuild -exportArchive -archivePath "$work/AssistedChat.xcarchive" -exportPath "$work/export" -exportOptionsPlist "$work/ExportOptions.plist"
python3 "$ci_dir/verify-ipa.py"
echo 'The signed IPA is verified and ready for TestFlight upload from the existing local submission workflow.'
