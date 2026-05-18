package uk.tyrerescue.assistedchat

import android.media.AudioAttributes
import android.media.MediaPlayer
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native Android foreground sound module.
 *
 * Plays android/app/src/main/res/raw/urgent_booking.mp3 via MediaPlayer.
 * Independent of the notification channel sound — required because the
 * Expo notification channel sound is unreliable while the app is in the
 * foreground and on stale installs where the channel was created without
 * sound and cannot be updated without uninstall + reinstall.
 */
class UrgentSoundModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var player: MediaPlayer? = null

  override fun getName(): String = "UrgentSoundModule"

  private fun releasePlayerLocked() {
    val p = player
    player = null
    if (p != null) {
      try {
        if (p.isPlaying) p.stop()
      } catch (_: Throwable) {
        // ignore
      }
      try {
        p.release()
      } catch (_: Throwable) {
        // ignore
      }
    }
  }

  @ReactMethod
  fun playUrgentBookingSound(promise: Promise) {
    val ctx = reactApplicationContext
    try {
      val resId = ctx.resources.getIdentifier("urgent_booking", "raw", ctx.packageName)
      if (resId == 0) {
        promise.resolve(false)
        return
      }

      synchronized(this) {
        releasePlayerLocked()
        val mp = MediaPlayer.create(ctx, resId)
        if (mp == null) {
          promise.resolve(false)
          return
        }
        try {
          mp.setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
        } catch (_: Throwable) {
          // ignore — best effort
        }
        mp.isLooping = false
        mp.setOnCompletionListener { completed ->
          synchronized(this) {
            if (player === completed) {
              try { completed.release() } catch (_: Throwable) { /* ignore */ }
              player = null
            } else {
              try { completed.release() } catch (_: Throwable) { /* ignore */ }
            }
          }
        }
        mp.setOnErrorListener { errored, _, _ ->
          synchronized(this) {
            if (player === errored) {
              try { errored.release() } catch (_: Throwable) { /* ignore */ }
              player = null
            } else {
              try { errored.release() } catch (_: Throwable) { /* ignore */ }
            }
          }
          true
        }
        player = mp
        try {
          mp.start()
        } catch (t: Throwable) {
          releasePlayerLocked()
          promise.resolve(false)
          return
        }
      }
      promise.resolve(true)
    } catch (t: Throwable) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stopUrgentBookingSound(promise: Promise) {
    try {
      synchronized(this) { releasePlayerLocked() }
      promise.resolve(true)
    } catch (_: Throwable) {
      promise.resolve(false)
    }
  }
}
