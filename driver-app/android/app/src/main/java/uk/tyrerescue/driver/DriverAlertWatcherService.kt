package uk.tyrerescue.driver

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Persistent foreground service that:
 *
 *  1. Keeps the driver app process alive while the driver is logged in /
 *     on duty so FCM `driver_new_job` data messages are delivered to a
 *     live process (Samsung One UI aggressively kills backgrounded apps).
 *  2. Polls `/api/driver/urgent-jobs-poll` every POLL_INTERVAL_MS as a
 *     safety net for cases where FCM is delayed or dropped. If a newly
 *     assigned booking is detected that the FCM path did not already
 *     alert for, the same full-screen alert is raised via
 *     `DriverJobAlertNotifier`.
 *
 * Restart strategy:
 *   - START_STICKY restarts the service after process death (unless the
 *     user Force Stopped the app — accepted Android limitation).
 *   - onTaskRemoved schedules a one-shot AlarmManager restart while armed.
 *   - DriverAlertBootReceiver re-arms after reboot when armed=true.
 */
class DriverAlertWatcherService : Service() {

  private val pollExecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
  private val polling = AtomicBoolean(false)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureWatcherChannel()
    val notification = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        // Android 14+ requires foregroundServiceType to match a granted use case.
        // The watcher exists to receive remote-messaging fallbacks for FCM, so
        // remoteMessaging matches the manifest declaration and avoids OEM
        // battery optimisations applied to dataSync services.
        startForeground(
          NOTIF_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING,
        )
      } else {
        startForeground(NOTIF_ID, notification)
      }
    } catch (err: Exception) {
      Log.e(TAG, "[driver-watcher] startForeground failed", err)
      try { startForeground(NOTIF_ID, notification) } catch (_: Exception) {}
    }
    writeArmed(this, true)
    writeArmedSince(this, System.currentTimeMillis())
    Log.i(TAG, "[driver-watcher] service started")
    startPollingLoop()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      Log.i(TAG, "[driver-watcher] stop requested")
      writeArmed(this, false)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    if (readArmed(this)) {
      try {
        val restartIntent = Intent(applicationContext, DriverAlertWatcherService::class.java).apply {
          action = ACTION_START
        }
        val piFlags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val pi = PendingIntent.getService(applicationContext, 2001, restartIntent, piFlags)
        val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 5_000L, pi)
        Log.i(TAG, "[driver-watcher] onTaskRemoved scheduled restart in 5s")
      } catch (err: Exception) {
        Log.w(TAG, "[driver-watcher] failed to schedule restart in onTaskRemoved", err)
      }
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    try { pollExecutor.shutdownNow() } catch (_: Exception) {}
    Log.i(TAG, "[driver-watcher] service destroyed")
  }

  private fun startPollingLoop() {
    try {
      pollExecutor.scheduleWithFixedDelay(
        ::pollOnce,
        INITIAL_DELAY_MS,
        POLL_INTERVAL_MS,
        TimeUnit.MILLISECONDS,
      )
    } catch (err: Exception) {
      Log.w(TAG, "[driver-watcher] failed to schedule polling loop", err)
    }
  }

  private fun pollOnce() {
    if (!polling.compareAndSet(false, true)) return
    var conn: HttpURLConnection? = null
    try {
      val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val token = prefs.getString(PREFS_AUTH_TOKEN_KEY, null)?.takeIf { it.isNotBlank() }
      val baseUrl = prefs.getString(PREFS_API_BASE_KEY, null)?.takeIf { it.isNotBlank() }
      if (token == null || baseUrl == null) {
        return
      }

      val armedSince = prefs.getLong(PREFS_ARMED_SINCE_KEY, 0L)
      val sinceParam = if (armedSince > 0L) "?since=$armedSince" else ""
      val url = URL("${baseUrl.trimEnd('/')}/api/driver/urgent-jobs-poll$sinceParam")
      conn = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "application/json")
        connectTimeout = 8_000
        readTimeout = 8_000
      }

      val status = conn.responseCode
      if (status == 401 || status == 403) {
        Log.w(TAG, "[driver-watcher] poll auth rejected status=$status — clearing token")
        prefs.edit().remove(PREFS_AUTH_TOKEN_KEY).apply()
        return
      }
      if (status != 200) {
        Log.w(TAG, "[driver-watcher] poll failed status=$status")
        return
      }

      val body = BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
      val json = JSONObject(body)
      val job = json.optJSONObject("job") ?: return
      val bookingRef = job.optString("bookingRef", "").takeIf { it.isNotBlank() } ?: return

      val lastAlertedRef = prefs.getString(PREFS_LAST_ALERTED_REF_KEY, null) ?: ""
      if (bookingRef == lastAlertedRef) {
        return
      }

      Log.i(TAG, "[driver-watcher] poll detected booking refSuffix=${bookingRef.takeLast(8)}")
      recordAlertedBookingRef(this, bookingRef)

      DriverJobAlertNotifier.postAlert(
        this,
        DriverJobAlertNotifier.JobAlertPayload(
          ref = bookingRef,
          title = job.optString("title", "New Job Assigned"),
          body = job.optString("body", "Tap to view the assigned job."),
          address = job.optString("address", "").takeIf { it.isNotBlank() },
          deepLink = null,
          amountToCollectPence = job.optString("amountToCollectPence", "").takeIf { it.isNotBlank() },
          paymentStatus = job.optString("paymentStatus", "").takeIf { it.isNotBlank() },
          paymentType = job.optString("paymentType", "").takeIf { it.isNotBlank() },
          jobPricePence = job.optString("jobPricePence", "").takeIf { it.isNotBlank() },
        ),
        sourceTag = "poll",
      )
    } catch (err: Exception) {
      Log.w(TAG, "[driver-watcher] poll failed: ${err.message}")
    } finally {
      try { conn?.disconnect() } catch (_: Exception) {}
      polling.set(false)
    }
  }

  private fun buildNotification(): Notification {
    val openIntent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val pi = PendingIntent.getActivity(
      this,
      0,
      openIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle("Driver alerts active")
      .setContentText("Listening for assigned jobs")
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setShowWhen(false)
      .setSilent(true)
      .setContentIntent(pi)
      .build()
  }

  private fun ensureWatcherChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(NotificationManager::class.java) ?: return
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Driver alert watcher",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Keeps driver job alerts active"
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    nm.createNotificationChannel(channel)
  }

  companion object {
    private const val TAG = "DriverAlertWatcherSvc"
    const val CHANNEL_ID = "driver_alert_watcher_v1"
    const val NOTIF_ID = 8001
    const val ACTION_START = "uk.tyrerescue.driver.DRIVER_ALERT_WATCHER_START"
    const val ACTION_STOP = "uk.tyrerescue.driver.DRIVER_ALERT_WATCHER_STOP"
    const val PREFS_NAME = "driver_alert_prefs"
    const val PREFS_ARMED_KEY = "armed"
    const val PREFS_ARMED_SINCE_KEY = "armed_since"
    const val PREFS_AUTH_TOKEN_KEY = "auth_token"
    const val PREFS_API_BASE_KEY = "api_base"
    const val PREFS_LAST_ALERTED_REF_KEY = "last_alerted_booking_ref"

    private const val INITIAL_DELAY_MS = 10_000L
    private const val POLL_INTERVAL_MS = 18_000L

    fun start(context: Context) {
      val intent = Intent(context, DriverAlertWatcherService::class.java).apply {
        action = ACTION_START
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (err: Exception) {
        Log.e(TAG, "[driver-watcher] failed to start service", err)
      }
    }

    fun stop(context: Context) {
      try {
        writeArmed(context, false)
        try {
          context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(PREFS_ARMED_SINCE_KEY)
            .remove(PREFS_LAST_ALERTED_REF_KEY)
            .apply()
        } catch (_: Exception) {}
        try {
          val stopIntent = Intent(context, DriverAlertWatcherService::class.java).apply {
            action = ACTION_STOP
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(stopIntent)
          } else {
            context.startService(stopIntent)
          }
        } catch (_: Exception) {}
        context.stopService(Intent(context, DriverAlertWatcherService::class.java))
      } catch (err: Exception) {
        Log.e(TAG, "[driver-watcher] failed to stop service", err)
      }
    }

    fun setAuth(context: Context, token: String, apiBase: String) {
      try {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .putString(PREFS_AUTH_TOKEN_KEY, token)
          .putString(PREFS_API_BASE_KEY, apiBase.trimEnd('/'))
          .apply()
      } catch (err: Exception) {
        Log.w(TAG, "[driver-watcher] failed to write auth", err)
      }
    }

    fun clearAuth(context: Context) {
      try {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .remove(PREFS_AUTH_TOKEN_KEY)
          .remove(PREFS_API_BASE_KEY)
          .remove(PREFS_LAST_ALERTED_REF_KEY)
          .apply()
      } catch (err: Exception) {
        Log.w(TAG, "[driver-watcher] failed to clear auth", err)
      }
    }

    /**
     * Atomically test-and-set the last alerted booking ref.
     *
     * Returns true when this caller "won" — i.e. the ref was different from
     * the previously stored ref and the new value has been persisted.
     * Returns false when the ref equals the previously stored ref (duplicate
     * alert path: FCM and poll both observed the same booking).
     */
    fun shouldAlertForRef(context: Context, ref: String): Boolean {
      if (ref.isBlank()) return true
      return try {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val previous = prefs.getString(PREFS_LAST_ALERTED_REF_KEY, null) ?: ""
        if (previous == ref) {
          false
        } else {
          prefs.edit().putString(PREFS_LAST_ALERTED_REF_KEY, ref).apply()
          true
        }
      } catch (_: Exception) {
        true
      }
    }

    fun recordAlertedBookingRef(context: Context, ref: String) {
      try {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .putString(PREFS_LAST_ALERTED_REF_KEY, ref)
          .apply()
      } catch (err: Exception) {
        Log.w(TAG, "[driver-watcher] failed to record alerted ref", err)
      }
    }

    fun readArmed(context: Context): Boolean {
      return try {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .getBoolean(PREFS_ARMED_KEY, false)
      } catch (_: Exception) {
        false
      }
    }

    private fun writeArmed(context: Context, armed: Boolean) {
      try {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .putBoolean(PREFS_ARMED_KEY, armed)
          .apply()
      } catch (err: Exception) {
        Log.w(TAG, "[driver-watcher] failed to write armed=$armed", err)
      }
    }

    private fun writeArmedSince(context: Context, ts: Long) {
      try {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getLong(PREFS_ARMED_SINCE_KEY, 0L) == 0L) {
          prefs.edit().putLong(PREFS_ARMED_SINCE_KEY, ts).apply()
        }
      } catch (err: Exception) {
        Log.w(TAG, "[driver-watcher] failed to write armed_since", err)
      }
    }
  }
}
