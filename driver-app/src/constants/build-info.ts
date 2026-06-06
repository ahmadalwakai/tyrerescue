/**
 * Build marker for verifying the installed APK is running the latest JS bundle.
 *
 * The native version (expo-application `nativeApplicationVersion` /
 * `nativeBuildVersion`) does not always change between rebuilds, so this
 * explicit, human-readable label is bumped whenever a notable code change ships.
 * Surfaced read-only in Profile → App & device. Contains NO secrets.
 *
 * Bump `BUILD_LABEL` on every release build so support can confirm the phone
 * is not running an older APK.
 */
export const BUILD_LABEL = '2026-06-06 alert readiness hardening';
