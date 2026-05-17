# scripts/create-admin-alert-keystore.ps1
#
# Generates the Android release signing keystore for the admin-alert-android app.
# Run once. The keystore is stored locally only — never committed to git.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\create-admin-alert-keystore.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$keystoreDir  = "C:\tyrerescue\android-keys"
$keystoreFile = "$keystoreDir\admin-alert-release.keystore"
$alias        = "admin-alert-key"

# ─── Check keytool is available ──────────────────────────────────────────────
$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $keytool) {
    Write-Host ""
    Write-Host "ERROR: keytool was not found. Install Android Studio or JDK 17, then reopen PowerShell." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Download Android Studio : https://developer.android.com/studio"
    Write-Host "  Download JDK 17         : https://adoptium.net/temurin/releases/?version=17"
    Write-Host ""
    exit 1
}

# ─── Create the keys folder if it does not exist ─────────────────────────────
if (-not (Test-Path $keystoreDir)) {
    New-Item -ItemType Directory -Path $keystoreDir | Out-Null
    Write-Host "Created folder: $keystoreDir"
}

# ─── Skip if keystore already exists ─────────────────────────────────────────
if (Test-Path $keystoreFile) {
    Write-Host ""
    Write-Host "Keystore already exists. No changes made." -ForegroundColor Yellow
    Write-Host "  File: $keystoreFile"
    Write-Host ""
    exit 0
}

# ─── Prompt for password securely ────────────────────────────────────────────
Write-Host ""
Write-Host "Tyre Rescue — Admin Alert Keystore Generator" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ""
Write-Host "Enter a strong password for the keystore."
Write-Host "You MUST save this password somewhere safe (e.g. a password manager)."
Write-Host "Losing it means you cannot sign future APK updates with the same identity."
Write-Host ""

$pass1 = Read-Host "Enter keystore password" -AsSecureString
$pass2 = Read-Host "Confirm keystore password" -AsSecureString

# Convert to plain text only long enough to compare — do not print
$bstr1 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass1)
$bstr2 = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass2)
$plain1 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr1)
$plain2 = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr2)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr1)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr2)

if ($plain1 -ne $plain2) {
    Write-Host ""
    Write-Host "ERROR: Passwords do not match. No keystore was created." -ForegroundColor Red
    Write-Host ""
    # Clear the plain text from memory before exiting
    $plain1 = $null
    $plain2 = $null
    exit 1
}

if ($plain1.Length -lt 6) {
    Write-Host ""
    Write-Host "ERROR: Password must be at least 6 characters." -ForegroundColor Red
    Write-Host ""
    $plain1 = $null
    $plain2 = $null
    exit 1
}

# ─── Generate the keystore ────────────────────────────────────────────────────
Write-Host ""
Write-Host "Generating keystore..." -ForegroundColor Cyan

$dname = "CN=Tyre Rescue, OU=Admin, O=Tyre Rescue, L=Glasgow, ST=Scotland, C=GB"

& keytool `
    -genkeypair `
    -v `
    -keystore "$keystoreFile" `
    -alias "$alias" `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass "$plain1" `
    -keypass "$plain1" `
    -dname "$dname" `
    -noprompt 2>&1

$exitCode = $LASTEXITCODE

# Clear password from memory immediately after use
$savedPass = $plain1
$plain1 = $null
$plain2 = $null

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "ERROR: keytool failed (exit code $exitCode). Check output above." -ForegroundColor Red
    Write-Host ""
    exit $exitCode
}

# ─── Success ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Keystore created successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Save these details securely:" -ForegroundColor Yellow
Write-Host "  Keystore file  : $keystoreFile"
Write-Host "  Keystore alias : $alias"
Write-Host "  Keystore password : the password you entered"
Write-Host "  Key password      : same as keystore password unless changed"
Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Yellow
Write-Host "  - Do NOT upload the keystore to GitHub or any cloud storage."
Write-Host "  - Store the password in a password manager or encrypted vault."
Write-Host "  - Losing the password means future APK updates cannot use this signing identity."
Write-Host ""

$savedPass = $null
exit 0
