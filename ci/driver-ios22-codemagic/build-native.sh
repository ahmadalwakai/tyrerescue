#!/bin/bash
set -euo pipefail
umask 077
ci_dir="$CM_BUILD_DIR/$DRIVER_CI_DIR"
signing="$DRIVER_CI_TEMP/driver-ios22-signing"
work="$DRIVER_CI_TEMP/driver-ios22-work"
output="$DRIVER_CI_TEMP/driver-ios22-output"
test ! -e "$work" && test ! -e "$output"
mkdir -m 700 "$work" "$output"
trap 'bash "$ci_dir/cleanup.sh"' EXIT

# Decode existing app secrets only now; dependency/prebuild child processes received no signing environment.
python3 "$ci_dir/prepare-signing.py"
keychain="$signing/signing.keychain-db"
keychain_password="$(cat "$signing/keychain-password.txt")"
security create-keychain -p "$keychain_password" "$keychain" >/dev/null 2>&1
security set-keychain-settings -lut 10800 "$keychain" >/dev/null 2>&1
security unlock-keychain -p "$keychain_password" "$keychain" >/dev/null 2>&1
security import "$signing/distribution.p12" -P "$DRIVER_IOS_P12_PASSWORD" -A -t cert -f pkcs12 -k "$keychain" > "$work/keychain-import.log" 2>&1
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$keychain_password" "$keychain" > "$work/keychain-partition.log" 2>&1
python3 - <<'PY'
import os, shlex, subprocess
from pathlib import Path
temporary = str(Path(os.environ['DRIVER_CI_TEMP']) / 'driver-ios22-signing/signing.keychain-db')
existing = shlex.split(subprocess.check_output(['security', 'list-keychains', '-d', 'user'], text=True))
search_list = [temporary] + [value for value in existing if value != temporary]
subprocess.run(['security', 'list-keychains', '-d', 'user', '-s', *search_list], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
PY
security find-identity -v -p codesigning "$keychain" > "$signing/identities.txt"
python3 - <<'PY'
import json, os
from pathlib import Path
p = Path(os.environ['DRIVER_CI_TEMP']) / 'driver-ios22-signing'
meta = json.loads((p / 'metadata.json').read_text())
assert meta['certificateSha1'] in (p / 'identities.txt').read_text(), 'The imported signing identity is unavailable'
PY
unset DRIVER_IOS_P12_BASE64 DRIVER_IOS_P12_PASSWORD DRIVER_IOS_PROFILE_BASE64 keychain_password
rm -f -- "$signing/distribution.p12" "$signing/keychain-password.txt"
ruby "$ci_dir/configure-signing.rb"
workspace="$(python3 -c 'import json,os; print(json.load(open(os.path.join(os.environ["DRIVER_CI_TEMP"],"driver-ios22-signing/xcode-target.json")))["workspace"])')"
scheme="$(python3 -c 'import json,os; print(json.load(open(os.path.join(os.environ["DRIVER_CI_TEMP"],"driver-ios22-signing/xcode-target.json")))["scheme"])')"

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

run_logged archive xcodebuild -workspace "$workspace" -scheme "$scheme" -configuration Release -destination 'generic/platform=iOS' -archivePath "$work/TyreRescueDriver.xcarchive" -derivedDataPath "$work/DerivedData" -resultBundlePath "$work/ArchiveResult.xcresult" archive

python3 - <<'PY'
import json, os, plistlib
from pathlib import Path
t = Path(os.environ['DRIVER_CI_TEMP'])
m = json.loads((t / 'driver-ios22-signing/metadata.json').read_text())
options = {'method': 'app-store-connect', 'destination': 'export', 'signingStyle': 'manual', 'teamID': m['team'], 'signingCertificate': m['certificateSha1'], 'provisioningProfiles': {m['bundle']: m['uuid']}, 'manageAppVersionAndBuildNumber': False, 'stripSwiftSymbols': True, 'uploadSymbols': False}
(t / 'driver-ios22-work/ExportOptions.plist').write_bytes(plistlib.dumps(options))
PY
run_logged export xcodebuild -exportArchive -archivePath "$work/TyreRescueDriver.xcarchive" -exportPath "$work/export" -exportOptionsPlist "$work/ExportOptions.plist"
python3 "$ci_dir/verify-ipa.py"
echo 'The signed IPA is verified and ready for TestFlight upload from the existing local submission workflow.'
