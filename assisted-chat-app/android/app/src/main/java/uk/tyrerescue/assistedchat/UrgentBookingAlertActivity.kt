package uk.tyrerescue.assistedchat

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.MediaPlayer
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

class UrgentBookingAlertActivity : AppCompatActivity() {

  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private val handler = Handler(Looper.getMainLooper())
  private val stopAlarmRunnable = Runnable {
    stopAlertSignals()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val bookingId = intent?.getStringExtra(EXTRA_BOOKING_ID).orEmpty()
    val bookingSuffix = bookingId.takeLast(8).ifBlank { "unknown" }
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Emergency booking received"
    val body = intent?.getStringExtra(EXTRA_BODY) ?: "A new emergency booking needs immediate action."
    val customerPhone = intent?.getStringExtra(EXTRA_CUSTOMER_PHONE).orEmpty()
    val createdAt = intent?.getStringExtra(EXTRA_CREATED_AT).orEmpty()

    Log.i(TAG, "onCreate bookingIdSuffix=$bookingSuffix")

    try {
      enableLockScreenDisplay()
      setContentView(buildContentView(bookingId, title, body, customerPhone, createdAt))
      startAlertSignals(bookingSuffix)
    } catch (err: Exception) {
      Log.e(TAG, "Failed to initialize urgent booking alert UI", err)
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
    bookingId: String,
    title: String,
    body: String,
    customerPhone: String,
    createdAt: String,
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

    val bookingView = TextView(this).apply {
      val shownBookingId = if (bookingId.isNotBlank()) bookingId else "unknown"
      text = "Booking ID: $shownBookingId"
      setTextColor(Color.parseColor("#CFD8E3"))
      textSize = 18f
      gravity = Gravity.CENTER
      setPadding(0, 20, 0, 0)
    }

    val phoneView = TextView(this).apply {
      text = if (customerPhone.isNotBlank()) "Phone: $customerPhone" else "Phone: not provided"
      setTextColor(Color.parseColor("#CFD8E3"))
      textSize = 18f
      gravity = Gravity.CENTER
      setPadding(0, 12, 0, 0)
    }

    val createdAtView = TextView(this).apply {
      text = if (createdAt.isNotBlank()) "Created: $createdAt" else "Created: not provided"
      setTextColor(Color.parseColor("#9CA3AF"))
      textSize = 16f
      gravity = Gravity.CENTER
      setPadding(0, 12, 0, 32)
    }

    val openAppButton = Button(this).apply {
      text = "Open app"
      textSize = 18f
      setOnClickListener {
        Log.i(TAG, "open app pressed bookingIdSuffix=${bookingId.takeLast(8).ifBlank { "unknown" }}")
        openMainActivity(bookingId)
      }
    }

    val dismissButton = Button(this).apply {
      text = "Dismiss"
      textSize = 18f
      setPadding(0, 20, 0, 0)
      setOnClickListener {
        Log.i(TAG, "dismiss pressed bookingIdSuffix=${bookingId.takeLast(8).ifBlank { "unknown" }}")
        stopAlertSignals()
        finish()
      }
    }

    root.addView(titleView)
    root.addView(bodyView)
    root.addView(bookingView)
    root.addView(phoneView)
    root.addView(createdAtView)
    root.addView(openAppButton)
    root.addView(dismissButton)
    return root
  }

  private fun startAlertSignals(bookingSuffix: String) {
    try {
      val player = MediaPlayer.create(this, R.raw.urgent_booking)
      if (player == null) {
        Log.e(TAG, "sound start failed bookingIdSuffix=$bookingSuffix reason=MediaPlayer.create returned null")
      }

      mediaPlayer = player?.apply {
        isLooping = true
        setOnErrorListener { _, what, extra ->
          Log.e(TAG, "MediaPlayer error what=$what extra=$extra")
          true
        }
        start()
        Log.i(TAG, "sound start success bookingIdSuffix=$bookingSuffix")
      }
    } catch (err: Exception) {
      Log.e(TAG, "sound start failure bookingIdSuffix=$bookingSuffix", err)
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
        Log.i(TAG, "vibration start success bookingIdSuffix=$bookingSuffix")
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
      Log.e(TAG, "Failed to stop urgent sound", err)
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.cancel()
      } else {
        @Suppress("DEPRECATION")
        vibrator?.cancel()
      }
    } catch (err: Exception) {
      Log.e(TAG, "Failed to stop vibration", err)
    }
  }

  private fun openMainActivity(bookingId: String) {
    try {
      val intent = Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra(EXTRA_TYPE, "urgent_booking")
        if (bookingId.isNotBlank()) {
          putExtra(EXTRA_BOOKING_ID, bookingId)
        }
      }
      startActivity(intent)
    } catch (err: Exception) {
      Log.e(TAG, "Failed to open MainActivity", err)
    } finally {
      finish()
    }
  }

  companion object {
    private const val TAG = "UrgentBookingAlertActivity"
    private const val ALERT_TIMEOUT_MS = 60_000L
    private const val EXTRA_TYPE = "type"
    private const val EXTRA_BOOKING_ID = "bookingId"
    private const val EXTRA_TITLE = "title"
    private const val EXTRA_BODY = "body"
    private const val EXTRA_CUSTOMER_PHONE = "customerPhone"
    private const val EXTRA_CREATED_AT = "createdAt"
  }
}
