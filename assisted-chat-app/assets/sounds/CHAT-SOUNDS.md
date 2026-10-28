# Chat send and receive sounds

Downloaded on 2026-10-22. These are downloaded sound recordings, not generated tones.

- Original author/pack: [Kenney, Interface Sounds 1.0](https://kenney.nl/assets/interface-sounds).
- Original archive: <https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip>.
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
- Kenney's included license is preserved as `KENNEY-LICENSE.txt`.
- Kenney confirms commercial use at <https://kenney.nl/support>.
- WAV conversion/distribution: [Calinou's Kenney Interface Sounds](https://github.com/Calinou/kenney-interface-sounds), pinned revision `4596a49eaf5a533948d49a47467f606bcdea70ff`. Its README documents the Ogg-to-WAV conversion and CC0 license. The WAV files below were downloaded byte-for-byte; this app did not alter them.

| App asset | Download URL | PCM format | Duration | SHA-256 |
| --- | --- | --- | --- | --- |
| `chat-send.wav` | <https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/4596a49eaf5a533948d49a47467f606bcdea70ff/addons/kenney_interface_sounds/select_001.wav> | 44.1 kHz, 16-bit, stereo | 0.0624 seconds | `3d9e86003f8ebd1a3f6f3d8af65b6b682562a46d532ccd204dcba21305b950ff` |
| `chat-receive.wav` | <https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/4596a49eaf5a533948d49a47467f606bcdea70ff/addons/kenney_interface_sounds/confirmation_001.wav> | 44.1 kHz, 16-bit, mono | 0.2946 seconds | `f9d0ef5a5c740c2ac250ac3876db9e4340669044a5bf78ae09192918db3e2ebc` |

## Playback

iOS uses the existing lazy `expo-notifications` facade for a foreground sound-only local request: no banner, list entry, badge, customer data, or navigation. It requires notification sound permission and respects iPhone silent mode and Focus. No microphone or background audio capability is added, and `expo-audio` remains excluded because of the existing native crash investigation.

The existing notification plugin bundles both WAV files on the next authorized native build. An already-installed binary does not acquire native sound resources from a JavaScript change. Web uses the same bundled WAV assets through `HTMLAudioElement`, subject to browser autoplay permission. Android chat tones are intentionally unavailable until a safe in-app player is introduced; existing Android booking notification channels are unchanged.

The first message batch/history is silent. A new driver/customer message plays one receive sound per batch; repeated polls, edits, deleted messages, internal admin notes, and an admin's own messages do not replay it. Send sound follows server confirmation only. Closing/switching chat, changing project/session, or leaving the foreground cancels pending sound work. A sound that iOS has already begun playing cannot be stopped through the notification API; both recordings are shorter than 0.3 seconds.
