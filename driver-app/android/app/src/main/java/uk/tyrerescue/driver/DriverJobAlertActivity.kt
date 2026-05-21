package uk.tyrerescue.driver

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Full-screen, call-style alert activity shown over the lock screen when a
 * new job is assigned to the driver. Triggered via NotificationCompat
 * `setFullScreenIntent` from `DriverJobAlertNotifier`.
 */
class DriverJobAlertActivity : AppCompatActivity() {

  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private val handler = Handler(Looper.getMainLooper())
  private val stopAlarmRunnable = Runnable {
    stopAlertSignals()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val ref = intent?.getStringExtra(DriverJobAlertNotifier.EXTRA_REF).orEmpty()
    val refSuffix = ref.takeLast(8).ifBlank { "unknown" }
    val title = intent?.getStringExtra(DriverJobAlertNotifier.EXTRA_TITLE) ?: "New job assigned"
    val body = intent?.getStringExtra(DriverJobAlertNotifier.EXTRA_BODY) ?: "Tap to view the assigned job."
    val address = intent?.getStringExtra(DriverJobAlertNotifier.EXTRA_ADDRESS).orEmpty()
    val deepLink = intent?.getStringExtra(DriverJobAlertNotifier.EXTRA_URL).orEmpty()
    val amountToCollectPence = intent?.getStringExtra(DriverJobAlertNotifier.EXTRA_AMOUNT_TO_COLLECT_PENCE).orEmpty()
    val paymentStatus = intent?.getStringExtra(DriverJobAlertNotifier.EXTRA_PAYMENT_STATUS).orEmpty()

    Log.i(TAG, "onCreate refSuffix=$refSuffix")

    try {
      enableLockScreenDisplay()
      setContentView(buildContentView(ref, title, body, address, deepLink, amountToCollectPence, paymentStatus))
      startAlertSignals(refSuffix)
    } catch (err: Exception) {
      Log.e(TAG, "Failed to initialize driver job alert UI", err)
      finish()
    }
  }

  override fun onDestroy() {
    stopAlertSignals()
    super.onDestroy()
  }

  private fun enableLockScreenDisplay() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        setShowWhenLocked(true)
        setTurnScreenOn(true)
      }

      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        keyguardManager?.requestDismissKeyguard(this, null)
      }
    } catch (err: Exception) {
      Log.e(TAG, "Failed to configure lock-screen visibility", err)
    }
  }

  private fun buildContentView(
    ref: String,
    title: String,
    body: String,
    address: String,
    deepLink: String,
    amountToCollectPence: String,
    paymentStatus: String,
  ): LinearLayout {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(48, 64, 48, 64)
      setBackgroundColor(Color.parseColor("#10131A"))
    }

    val titleView = TextView(this).apply {
      text = title
      setTextColor(Color.WHITE)
      textSize = 28f
      gravity = Gravity.CENTER
    }

    val bodyView = TextView(this).apply {
      text = body
      setTextColor(Color.parseColor("#E5E7EB"))
      textSize = 20f
      gravity = Gravity.CENTER
      setPadding(0, 18, 0, 0)
    }

    val refView = TextView(this).apply {
      val shown = if (ref.isNotBlank()) ref else "unknown"
      text = "Ref: $shown"
      setTextColor(Color.parseColor("#CFD8E3"))
      textSize = 18f
      gravity = Gravity.CENTER
      setPadding(0, 20, 0, 0)
    }

    val addressView = TextView(this).apply {
      text = if (address.isNotBlank()) address else "Address: not provided"
      setTextColor(Color.parseColor("#CFD8E3"))
      textSize = 16f
      gravity = Gravity.CENTER
      setPadding(0, 12, 0, 12)
    }

    val paymentView = TextView(this).apply {
      val pence = amountToCollectPence.toLongOrNull()
      text = when {
        paymentStatus == "paid" || pence == 0L -> "No cash to collect"
        pence != null && pence > 0 -> {
          val pounds = pence / 100.0
          "Collect on arrival: \u00A3${String.format("%.2f", pounds)}"
        }
        else -> "Confirm payment with admin"
      }
      setTextColor(Color.parseColor("#F97316"))
      textSize = 18f
      gravity = Gravity.CENTER
      setPadding(0, 0, 0, 28)
    }

    val openButton = Button(this).apply {
      text = "Open job"
      textSize = 18f
      setOnClickListener {
        Log.i(TAG, "open job pressed refSuffix=${ref.takeLast(8).ifBlank { "unknown" }}")
        openDeepLink(
          ref = ref,
          fallbackPath = "jobs/$ref",
          providedLink = deepLink,
        )
      }
    }

    val startRouteButton = Button(this).apply {
      text = "Start route"
      textSize = 18f
      setPadding(0, 16, 0, 0)
      setOnClickListener {
        Log.i(TAG, "start route pressed refSuffix=${ref.takeLast(8).ifBlank { "unknown" }}")
        openDeepLink(
          ref = ref,
          fallbackPath = "jobs/$ref/route",
          providedLink = null,
        )
      }
    }

    val dismissButton = Button(this).apply {
      text = "Dismiss"
      textSize = 18f
      setPadding(0, 20, 0, 0)
      setOnClickListener {
        Log.i(TAG, "dismiss pressed refSuffix=${ref.takeLast(8).ifBlank { "unknown" }}")
        stopAlertSignals()
        finish()
      }
    }

    root.addView(titleView)
    root.addView(bodyView)
    root.addView(refView)
    root.addView(addressView)
    root.addView(paymentView)
    root.addView(openButton)
    root.addView(startRouteButton)
    root.addView(dismissButton)
    return root
  }

  private fun startAlertSignals(refSuffix: String) {
    try {
      val resId = resources.getIdentifier("new_job", "raw", packageName)
      val player = if (resId != 0) {
        MediaPlayer.create(this, resId)
      } else {
        MediaPlayer.create(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
      }
      if (player == null) {
        Log.e(TAG, "sound start failed refSuffix=$refSuffix reason=MediaPlayer.create returned null")
      }

      mediaPlayer = player?.apply {
        isLooping = true
        setOnErrorListener { _, what, extra ->
          Log.e(TAG, "MediaPlayer error what=$what extra=$extra")
          true
        }
        start()
        Log.i(TAG, "sound start success refSuffix=$refSuffix")
      }
    } catch (err: Exception) {
      Log.e(TAG, "sound start failure refSuffix=$refSuffix", err)
    }

    try {
      vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }

      val pattern = longArrayOf(0, 500, 250, 500, 250, 900)
      val v = vibrator
      if (v != null && v.hasVibrator()) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          v.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
          @Suppress("DEPRECATION")
          v.vibrate(pattern, 0)
        }
        Log.i(TAG, "vibration start success refSuffix=$refSuffix")
      }
    } catch (err: Exception) {
      Log.e(TAG, "Failed to start vibration", err)
    }

    handler.removeCallbacks(stopAlarmRunnable)
    handler.postDelayed(stopAlarmRunnable, ALERT_TIMEOUT_MS)
  }

  private fun stopAlertSignals() {
    handler.removeCallbacks(stopAlarmRunnable)

    try {
      mediaPlayer?.run {
        if (isPlaying) {
          stop()
        }
        release()
      }
      mediaPlayer = null
    } catch (err: Exception) {
      Log.e(TAG, "Failed to stop alert sound", err)
    }

    try {
      vibrator?.cancel()
    } catch (err: Exception) {
      Log.e(TAG, "Failed to stop vibration", err)
    }
  }

  private fun openDeepLink(ref: String, fallbackPath: String, providedLink: String?) {
    val link = when {
      !providedLink.isNullOrBlank() -> providedLink
      ref.isNotBlank() || fallbackPath.isNotBlank() -> "tyrerescuedriver://$fallbackPath"
      else -> ""
    }

    val launched = if (link.isNotBlank()) {
      try {
        val viewIntent = Intent(Intent.ACTION_VIEW, Uri.parse(link)).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(viewIntent)
        true
      } catch (err: Exception) {
        Log.w(TAG, "Deep-link launch failed link=$link", err)
        false
      }
    } else {
      false
    }

    if (!launched) {
      try {
        val fallback = Intent(this, MainActivity::class.java).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
          putExtra(DriverJobAlertNotifier.EXTRA_TYPE, "driver_new_job")
          if (ref.isNotBlank()) {
            putExtra(DriverJobAlertNotifier.EXTRA_REF, ref)
          }
        }
        startActivity(fallback)
      } catch (err: Exception) {
        Log.e(TAG, "Failed to open MainActivity fallback", err)
      }
    }

    stopAlertSignals()
    finish()
  }

  companion object {
    private const val TAG = "DriverJobAlertActivity"
    private const val ALERT_TIMEOUT_MS = 60_000L
  }
}
