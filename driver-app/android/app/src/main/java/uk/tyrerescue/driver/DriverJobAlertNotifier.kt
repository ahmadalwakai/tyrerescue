package uk.tyrerescue.driver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.Resources
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Posts the high-importance, full-screen "new driver job" notification.
 * Mirrors the proven assisted-chat-app urgent-alert pattern.
 */
object DriverJobAlertNotifier {
  private const val TAG = "DriverJobAlertNotifier"
  // Bumped to v2 because Android caches NotificationChannel importance from
  // the first creation; existing installs need a fresh channel id to pick up
  // the IMPORTANCE_MAX upgrade required for Samsung lock-screen pop-ups.
  const val CHANNEL_ID = "driver_jobs_urgent_v2"
  private const val CHANNEL_NAME = "New driver jobs"
  private const val CHANNEL_DESCRIPTION = "High-priority alerts for newly assigned jobs"
  private const val GRANT_NOTIF_ID = 9998
  private const val SOUND_RES_NAME = "new_job"

  private val VIBRATION_PATTERN = longArrayOf(0, 500, 250, 500, 250, 900)

  private val AUDIO_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  data class JobAlertPayload(
    val ref: String?,
    val title: String,
    val body: String,
    val address: String?,
    val deepLink: String?,
    val amountToCollectPence: String? = null,
    val paymentStatus: String? = null,
  )

  fun postAlert(context: Context, payload: JobAlertPayload, sourceTag: String) {
    val refSuffix = payload.ref?.takeLast(8) ?: "unknown"
    Log.i(TAG, "[native-alert] notify requested source=$sourceTag refSuffix=$refSuffix")

    // Dedupe across FCM and polling fallback. We only suppress duplicates
    // when the booking ref is known; if no ref is present we always alert.
    val ref = payload.ref?.takeIf { it.isNotBlank() }
    if (ref != null && !DriverAlertWatcherService.shouldAlertForRef(context, ref)) {
      Log.i(TAG, "[native-alert] dedupe skip source=$sourceTag refSuffix=$refSuffix (already alerted)")
      return
    }

    ensureChannel(context)

    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    val launchIntent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(EXTRA_TYPE, "driver_new_job")
      payload.ref?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_REF, it) }
      payload.deepLink?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_URL, it) }
    }
    val contentIntent = PendingIntent.getActivity(context, 0, launchIntent, pendingFlags)

    val fullScreenIntent = Intent(context, DriverJobAlertActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(EXTRA_TYPE, "driver_new_job")
      payload.ref?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_REF, it) }
      putExtra(EXTRA_TITLE, payload.title)
      putExtra(EXTRA_BODY, payload.body)
      payload.address?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_ADDRESS, it) }
      payload.deepLink?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_URL, it) }
      payload.amountToCollectPence?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_AMOUNT_TO_COLLECT_PENCE, it) }
      payload.paymentStatus?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_PAYMENT_STATUS, it) }
    }
    val fullScreenPi = PendingIntent.getActivity(context, 1, fullScreenIntent, pendingFlags)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      try {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val canUseFullScreen = manager.canUseFullScreenIntent()
        Log.i(TAG, "[native-alert] canUseFullScreenIntent refSuffix=$refSuffix allowed=$canUseFullScreen")
        if (!canUseFullScreen) {
          Log.w(TAG, "[native-alert] full-screen permission missing refSuffix=$refSuffix")
          postFullScreenIntentGrantNotification(context)
        }
      } catch (err: Exception) {
        Log.w(TAG, "[native-alert] permission check failed refSuffix=$refSuffix", err)
      }
    }

    val soundUri = resolveSoundUri(context)

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(payload.title)
      .setContentText(payload.body)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(false)
      .setContentIntent(contentIntent)
      .setFullScreenIntent(fullScreenPi, true)
      .setVibrate(VIBRATION_PATTERN)
      .setSound(soundUri)

    val notificationId = if (!payload.ref.isNullOrBlank()) {
      payload.ref.hashCode()
    } else {
      (System.currentTimeMillis() and Int.MAX_VALUE.toLong()).toInt()
    }

    try {
      NotificationManagerCompat.from(context).notify(notificationId, builder.build())
      Log.i(TAG, "[native-alert] notification posted source=$sourceTag refSuffix=$refSuffix notificationId=$notificationId")
    } catch (err: Exception) {
      Log.e(TAG, "[native-alert] notification post failed source=$sourceTag", err)
    }

    // Pre-Q fallback: directly launch the alert activity.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      try {
        context.startActivity(fullScreenIntent)
      } catch (err: Exception) {
        Log.w(TAG, "direct Activity launch failed source=$sourceTag", err)
      }
    }
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    try {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(
        CHANNEL_ID,
        CHANNEL_NAME,
        NotificationManager.IMPORTANCE_MAX,
      ).apply {
        description = CHANNEL_DESCRIPTION
        setSound(resolveSoundUri(context), AUDIO_ATTRIBUTES)
        enableVibration(true)
        vibrationPattern = VIBRATION_PATTERN
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
      manager.createNotificationChannel(channel)
    } catch (err: Exception) {
      Log.e(TAG, "Failed to create driver jobs channel", err)
    }
  }

  private fun resolveSoundUri(context: Context): Uri {
    return try {
      val resId = context.resources.getIdentifier(SOUND_RES_NAME, "raw", context.packageName)
      if (resId != 0) {
        Uri.parse("android.resource://${context.packageName}/$resId")
      } else {
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      }
    } catch (_: Resources.NotFoundException) {
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
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
        .setContentTitle("Action required: full-screen alerts blocked")
        .setContentText("Tap to allow Tyre Rescue Driver to show new-job alerts over the lock screen.")
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

  const val EXTRA_TYPE = "type"
  const val EXTRA_REF = "ref"
  const val EXTRA_TITLE = "title"
  const val EXTRA_BODY = "body"
  const val EXTRA_ADDRESS = "address"
  const val EXTRA_URL = "url"
  const val EXTRA_AMOUNT_TO_COLLECT_PENCE = "amountToCollectPence"
  const val EXTRA_PAYMENT_STATUS = "paymentStatus"
}
