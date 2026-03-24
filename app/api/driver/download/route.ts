import { NextResponse } from 'next/server';

// Direct link to the latest EAS build APK.
// Update this URL each time a new production APK is built.
const APK_URL =
  'https://expo.dev/artifacts/eas/kN9CKw3Dp6BEEvHVRLQCMu.apk';

export async function GET() {
  return NextResponse.redirect(APK_URL, 302);
}
