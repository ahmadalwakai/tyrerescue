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
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class UrgentBookingMessagingService : FirebaseMessagingService() {

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    super.onMessageReceived(remoteMessage)

    try {
      val data = remoteMessage.data
      val messageId = remoteMessage.messageId ?: "unknown"
      val dataType = data["type"] ?: "missing"
      val dataKeys = data.keys.sorted().joinToString(",")

      Log.i(TAG, "onMessageReceived messageId=$messageId from=${remoteMessage.from ?: "unknown"}")
      Log.i(TAG, "data keys=$dataKeys")
      Log.i(TAG, "data.type=$dataType")

      if (dataType != "urgent_booking") {
        return
      }

      val bookingId = data["bookingId"]
      val bookingSuffix = bookingId?.takeLast(8) ?: "unknown"
      val title = data["title"] ?: "Emergency booking received"
      val body = data["body"] ?: "A new emergency booking needs immediate action."
      val customerPhone = data["customerPhone"]
      val createdAt = data["createdAt"]

      Log.i(TAG, "received urgent booking bookingIdSuffix=$bookingSuffix")

      ensureUrgentChannel()

      val launchIntent = Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra("type", "urgent_booking")
        if (!bookingId.isNullOrBlank()) {
          putExtra("bookingId", bookingId)
        }
        if (!createdAt.isNullOrBlank()) {
          putExtra("createdAt", createdAt)
        }
        putExtra("title", title)
        putExtra("body", body)
        if (!customerPhone.isNullOrBlank()) {
          putExtra("customerPhone", customerPhone)
        }
      }

      val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      val contentIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingIntentFlags)

      val fullScreenIntent = Intent(this, UrgentBookingAlertActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra("type", "urgent_booking")
        if (!bookingId.isNullOrBlank()) {
          putExtra("bookingId", bookingId)
        }
        putExtra("title", title)
        putExtra("body", body)
        if (!customerPhone.isNullOrBlank()) {
          putExtra("customerPhone", customerPhone)
        }
        if (!createdAt.isNullOrBlank()) {
          putExtra("createdAt", createdAt)
        }
      }
      val fullScreenPendingIntent = PendingIntent.getActivity(this, 1, fullScreenIntent, pendingIntentFlags)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        try {
          val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
          val canUseFullScreen = manager.canUseFullScreenIntent()
          Log.i(TAG, "fullScreenIntent permission bookingIdSuffix=$bookingSuffix allowed=$canUseFullScreen")
        } catch (err: Exception) {
          Log.w(TAG, "fullScreenIntent permission check failed bookingIdSuffix=$bookingSuffix", err)
        }
      }

      val notificationBuilder = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.notification_icon)
        .setContentTitle(title)
        .setContentText(body)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(false)
        .setContentIntent(contentIntent)
        .setFullScreenIntent(fullScreenPendingIntent, true)
        .setVibrate(VIBRATION_PATTERN)
        .setSound(URGENT_SOUND_URI)

      val notificationId = if (!bookingId.isNullOrBlank()) {
        bookingId.hashCode()
      } else {
        (System.currentTimeMillis() and Int.MAX_VALUE.toLong()).toInt()
      }

      with(NotificationManagerCompat.from(this)) {
        notify(notificationId, notificationBuilder.build())
      }

      val directActivityLaunchAttempted = maybeStartAlertActivityDirectly(fullScreenIntent, bookingSuffix)
      Log.i(TAG, "full-screen Activity launch attempted bookingIdSuffix=$bookingSuffix fullScreenIntent=true directStart=$directActivityLaunchAttempted")
      Log.i(TAG, "posted notification bookingIdSuffix=$bookingSuffix notificationId=$notificationId")
    } catch (err: Exception) {
      Log.e(TAG, "Failed to handle urgent booking message", err)
    }
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    val suffix = token.takeLast(8)
    Log.i(TAG, "FCM token refreshed, suffix=$suffix")
  }

  private fun ensureUrgentChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    try {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val existing = manager.getNotificationChannel(CHANNEL_ID)
      if (existing != null) {
        Log.i(TAG, "urgent channel exists id=$CHANNEL_ID importance=${existing.importance}")
      }

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
      Log.i(TAG, "urgent channel create/update requested id=$CHANNEL_ID importance=${channel.importance}")
    } catch (err: Exception) {
      Log.e(TAG, "Failed to create urgent booking channel", err)
    }
  }

  private fun maybeStartAlertActivityDirectly(intent: Intent, bookingSuffix: String): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      Log.i(TAG, "direct Activity launch skipped bookingIdSuffix=$bookingSuffix using fullScreenIntent path")
      return false
    }

    return try {
      startActivity(intent)
      Log.i(TAG, "direct Activity launch attempted bookingIdSuffix=$bookingSuffix")
      true
    } catch (err: Exception) {
      Log.w(TAG, "direct Activity launch failed bookingIdSuffix=$bookingSuffix", err)
      false
    }
  }

  companion object {
    private const val TAG = "UrgentBookingMessagingService"
    // v3: bumped from v2 because Android notification channel settings are sticky.
    // Devices that created v2 with the wrong sound/importance never receive updated
    // settings until the channel id changes (or the user uninstalls). A fresh id
    // forces a clean channel on install.
    private const val CHANNEL_ID = "urgent_bookings_v3"
    private const val CHANNEL_NAME = "Urgent bookings"
    private const val CHANNEL_DESCRIPTION = "Emergency booking alerts"

    private val VIBRATION_PATTERN = longArrayOf(0, 500, 250, 500, 250, 900)

    private val AUDIO_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

    private val URGENT_SOUND_URI: Uri =
      Uri.parse("android.resource://uk.tyrerescue.assistedchat/raw/urgent_booking")
  }
}
