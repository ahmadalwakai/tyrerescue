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
  // Channel id is bumped whenever the alert config changes, because Android
  // caches NotificationChannel importance and sound URI from the first
  // creation. v5: full-screen-intent gating, dropped background
  // startActivity path, IMPORTANCE_HIGH-or-MAX with custom sound +
  // CATEGORY_CALL for new driver jobs.
  const val CHANNEL_ID = "driver_jobs_urgent_v5"
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
    val jobId: String? = null,
    val assignmentId: String? = null,
    val title: String,
    val body: String,
    val address: String?,
    val deepLink: String?,
    val amountToCollectPence: String? = null,
    val paymentStatus: String? = null,
    val paymentType: String? = null,
    val jobPricePence: String? = null,
  )

  fun postAlert(context: Context, payload: JobAlertPayload, sourceTag: String) {
    val refSuffix = payload.ref?.takeLast(8) ?: "unknown"
    Log.i(TAG, "DRIVER_NATIVE_NOTIFY_ATTEMPT source=$sourceTag refSuffix=$refSuffix")
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
      payload.jobId?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_JOB_ID, it) }
      payload.assignmentId?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_ASSIGNMENT_ID, it) }
      putExtra(EXTRA_TITLE, payload.title)
      putExtra(EXTRA_BODY, payload.body)
      payload.address?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_ADDRESS, it) }
      payload.deepLink?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_URL, it) }
      payload.amountToCollectPence?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_AMOUNT_TO_COLLECT_PENCE, it) }
      payload.paymentStatus?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_PAYMENT_STATUS, it) }
      payload.paymentType?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_PAYMENT_TYPE, it) }
      payload.jobPricePence?.takeIf { it.isNotBlank() }?.let { putExtra(EXTRA_JOB_PRICE_PENCE, it) }
    }
    val fullScreenPi = PendingIntent.getActivity(context, 1, fullScreenIntent, pendingFlags)

    // Decide whether the OS will honour a full-screen intent. On Android 14+
    // the user must have granted USE_FULL_SCREEN_INTENT in app-info; below
    // 14 the permission is granted at install time so we always allow it.
    val canUseFullScreen: Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      try {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val allowed = manager.canUseFullScreenIntent()
        Log.i(TAG, "[native-alert] canUseFullScreenIntent refSuffix=$refSuffix allowed=$allowed")
        if (allowed) {
          Log.i(TAG, "DRIVER_FULLSCREEN_INTENT_ALLOWED refSuffix=$refSuffix")
        } else {
          Log.w(TAG, "DRIVER_FULLSCREEN_INTENT_BLOCKED refSuffix=$refSuffix reason=permission_denied_api34")
          Log.w(TAG, "[native-alert] full-screen permission missing refSuffix=$refSuffix")
          postFullScreenIntentGrantNotification(context)
        }
        allowed
      } catch (err: Exception) {
        Log.w(TAG, "[native-alert] permission check failed refSuffix=$refSuffix", err)
        false
      }
    } else {
      true
    }

    val soundUri = resolveSoundUri(context)

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(payload.title)
      .setContentText(payload.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(buildBigText(payload)))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setContentIntent(contentIntent)
      .setVibrate(VIBRATION_PATTERN)
      .setSound(soundUri)
      .setDefaults(0)

    // Only attach the full-screen intent when the OS will honour it. When
    // blocked we fall back to a heads-up notification only — a clear "Tap
    // to open job" message — and surface the reason to the React UI via
    // DriverAlertWatcherModule.canUseFullScreenIntent().
    if (canUseFullScreen) {
      builder.setFullScreenIntent(fullScreenPi, true)
    } else {
      builder.setContentText("Tap to open job")
    }

    val notificationId = if (!payload.ref.isNullOrBlank()) {
      payload.ref.hashCode()
    } else {
      (System.currentTimeMillis() and Int.MAX_VALUE.toLong()).toInt()
    }

    try {
      NotificationManagerCompat.from(context).notify(notificationId, builder.build())
      Log.i(
        TAG,
        "DRIVER_NATIVE_NOTIFY_SUCCESS source=$sourceTag refSuffix=$refSuffix notificationId=$notificationId fullScreenIntent=$canUseFullScreen channel=$CHANNEL_ID",
      )
      Log.i(
        TAG,
        "[native-alert] notification posted source=$sourceTag refSuffix=$refSuffix notificationId=$notificationId fullScreenIntent=$canUseFullScreen channel=$CHANNEL_ID",
      )
    } catch (err: Exception) {
      Log.e(TAG, "DRIVER_NATIVE_NOTIFY_FAIL source=$sourceTag refSuffix=$refSuffix error=${err.message}", err)
      Log.e(TAG, "[native-alert] notification post failed source=$sourceTag", err)
    }

    // NOTE: we deliberately do NOT call context.startActivity(fullScreenIntent)
    // from a background context. Android 10+ blocks background activity
    // starts in most cases, and on Android 12+ even the foreground service
    // grant is throttled. The only reliable path is the notification's
    // setFullScreenIntent above; if the user has blocked that permission
    // the heads-up notification is the visible alert and React UI prompts
    // them to grant full-screen permission.
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
  const val EXTRA_JOB_ID = "jobId"
  const val EXTRA_ASSIGNMENT_ID = "assignmentId"
  const val EXTRA_TITLE = "title"
  const val EXTRA_BODY = "body"
  const val EXTRA_ADDRESS = "address"
  const val EXTRA_URL = "url"
  const val EXTRA_AMOUNT_TO_COLLECT_PENCE = "amountToCollectPence"
  const val EXTRA_PAYMENT_STATUS = "paymentStatus"
  const val EXTRA_PAYMENT_TYPE = "paymentType"
  const val EXTRA_JOB_PRICE_PENCE = "jobPricePence"

  private fun buildBigText(payload: JobAlertPayload): String {
    val lines = mutableListOf<String>()
    lines.add(payload.body)
    payload.address?.takeIf { it.isNotBlank() }?.let { lines.add(it) }
    val price = payload.jobPricePence?.toLongOrNull()
    if (price != null && price > 0) {
      lines.add("Price: \u00A3${String.format("%.2f", price / 100.0)}")
    }
    val collect = payload.amountToCollectPence?.toLongOrNull()
    if (collect != null && collect > 0) {
      lines.add("Collect: \u00A3${String.format("%.2f", collect / 100.0)}")
    } else if (payload.paymentStatus == "paid" || collect == 0L) {
      lines.add("Nothing to collect")
    }
    return lines.joinToString("\n")
  }
}
