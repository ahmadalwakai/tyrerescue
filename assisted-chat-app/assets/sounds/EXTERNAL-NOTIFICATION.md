# iOS external notification sound

`assisted_notification.wav` is the user-selected audio extracted from
`WhatsApp Video 2026-10-28 at 6.02.32 PM.mp4`, supplied on 28 October 2026.
It uses the first 7 seconds, with a 50 ms fade at the end to avoid a cut-off click.
The original video remains unchanged and is not included in the app.

Format: 44,100 Hz, mono, 16-bit linear PCM WAV; duration: 7.000 seconds.
The file is bundled through the `expo-notifications` plugin in `app.json`.

The server's `resolveAdminNotificationSound` selects this resource for audible
Assisted Chat iOS pushes, including the account-settings test notification.
Android keeps its existing notification sounds and channels. Foreground chat
send/receive sounds are unchanged; explicitly silent pushes remain silent.

Release requires a new native iOS build containing this asset and deployment of
the server sound selection. Older iOS builds without the resource use the system
default sound. Verify background and locked-screen playback on a physical iPhone
after installing the new build; a successful Expo ticket only confirms acceptance.
