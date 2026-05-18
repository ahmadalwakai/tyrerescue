package uk.tyrerescue.assistedchat

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Shared logic for posting the full-screen, call-style urgent booking
 * notification. Used by both `UrgentBookingMessagingService` (FCM push path)
 * and `UrgentAlertWatcherService` (polling fallback path) so the user-visible
 * alert is identical regardless of which path detected the booking.
 */
object UrgentAlertNotifier {
  private const val TAG = "UrgentAlertNotifier"
  const val CHANNEL_ID = "urgent_bookings_v3"
  private const val CHANNEL_NAME = "Urgent bookings"
  private const val CHANNEL_DESCRIPTION = "Emergency booking alerts"
  private const val GRANT_NOTIF_ID = 9999

  private val VIBRATION_PATTERN = longArrayOf(0, 500, 250, 500, 250, 900)

  private val AUDIO_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  private val URGENT_SOUND_URI: Uri =
    Uri.parse("android.resource://uk.tyrerescue.assistedchat/raw/urgent_booking")

  data class UrgentPayload(
    val bookingId: String?,
    val title: String,
    val body: String,
    val customerPhone: String?,
    val createdAt: String?,
  )

  fun postAlert(context: Context, payload: UrgentPayload, sourceTag: String) {
    val bookingSuffix = payload.bookingId?.takeLast(8) ?: "unknown"
    Log.i(TAG, "postAlert source=$sourceTag bookingIdSuffix=$bookingSuffix")

    ensureUrgentChannel(context)

    val launchIntent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("type", "urgent_booking")
      payload.bookingId?.takeIf { it.isNotBlank() }?.let { putExtra("bookingId", it) }
      payload.createdAt?.takeIf { it.isNotBlank() }?.let { putExtra("createdAt", it) }
      putExtra("title", payload.title)
      putExtra("body", payload.body)
      payload.customerPhone?.takeIf { it.isNotBlank() }?.let { putExtra("customerPhone", it) }
    }

    val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val contentIntent = PendingIntent.getActivity(context, 0, launchIntent, pendingIntentFlags)

    val fullScreenIntent = Intent(context, UrgentBookingAlertActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("type", "urgent_booking")
      payload.bookingId?.takeIf { it.isNotBlank() }?.let { putExtra("bookingId", it) }
      putExtra("title", payload.title)
      putExtra("body", payload.body)
      payload.customerPhone?.takeIf { it.isNotBlank() }?.let { putExtra("customerPhone", it) }
      payload.createdAt?.takeIf { it.isNotBlank() }?.let { putExtra("createdAt", it) }
    }
    val fullScreenPendingIntent = PendingIntent.getActivity(context, 1, fullScreenIntent, pendingIntentFlags)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      try {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val canUseFullScreen = manager.canUseFullScreenIntent()
        Log.i(TAG, "fullScreenIntent permission bookingIdSuffix=$bookingSuffix allowed=$canUseFullScreen")
        if (!canUseFullScreen) {
          postFullScreenIntentGrantNotification(context)
        }
      } catch (err: Exception) {
        Log.w(TAG, "fullScreenIntent permission check failed bookingIdSuffix=$bookingSuffix", err)
      }
    }

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(payload.title)
      .setContentText(payload.body)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(false)
      .setContentIntent(contentIntent)
      .setFullScreenIntent(fullScreenPendingIntent, true)
      .setVibrate(VIBRATION_PATTERN)
      .setSound(URGENT_SOUND_URI)

    val notificationId = if (!payload.bookingId.isNullOrBlank()) {
      payload.bookingId.hashCode()
    } else {
      (System.currentTimeMillis() and Int.MAX_VALUE.toLong()).toInt()
    }

    try {
      NotificationManagerCompat.from(context).notify(notificationId, builder.build())
      Log.i(TAG, "posted urgent notification source=$sourceTag bookingIdSuffix=$bookingSuffix notificationId=$notificationId")
    } catch (err: Exception) {
      Log.e(TAG, "Failed to post urgent notification source=$sourceTag", err)
    }

    // On pre-Q devices a direct Activity launch was historically attempted;
    // on Q+ rely entirely on the system-handled fullScreenIntent.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      try {
        context.startActivity(fullScreenIntent)
      } catch (err: Exception) {
        Log.w(TAG, "direct Activity launch failed source=$sourceTag", err)
      }
    }
  }

  fun ensureUrgentChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    try {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(
        CHANNEL_ID,
        CHANNEL_NAME,
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = CHANNEL_DESCRIPTION
        setSound(URGENT_SOUND_URI, AUDIO_ATTRIBUTES)
        enableVibration(true)
        vibrationPattern = VIBRATION_PATTERN
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      manager.createNotificationChannel(channel)
    } catch (err: Exception) {
      Log.e(TAG, "Failed to create urgent booking channel", err)
    }
  }

  private fun postFullScreenIntentGrantNotification(context: Context) {
    try {
      val settingsIntent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
        data = Uri.parse("package:${context.packageName}")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      val settingsPi = PendingIntent.getActivity(
        context,
        99,
        settingsIntent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      val grantNotif = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.notification_icon)
        .setContentTitle("Action Required: Emergency Alert Blocked")
        .setContentText("Tap to grant full-screen alert permission. Emergency bookings cannot interrupt the screen until granted.")
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setContentIntent(settingsPi)
        .build()
      NotificationManagerCompat.from(context).notify(GRANT_NOTIF_ID, grantNotif)
      Log.i(TAG, "posted fullScreenIntent grant prompt notification")
    } catch (err: Exception) {
      Log.w(TAG, "Failed to post fullScreenIntent grant prompt", err)
    }
  }
}
