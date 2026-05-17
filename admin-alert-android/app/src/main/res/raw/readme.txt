# Place urgent_booking.wav here.
#
# This file will be referenced by the notification channel created in
# NotificationHelper.kt as res/raw/urgent_booking.wav.
#
# If this file is absent the notification channel falls back to the
# Android system default notification sound automatically.
#
# Source: copy urgent_booking.wav from
#   assisted-chat-app/assets/sounds/urgent_booking.mp3
# and convert to WAV format (PCM 16-bit, 44100 Hz, mono or stereo).
# WAV is preferred over MP3 for Android notification sounds.
#
# Example conversion with ffmpeg:
#   ffmpeg -i urgent_booking.mp3 -acodec pcm_s16le -ar 44100 urgent_booking.wav
