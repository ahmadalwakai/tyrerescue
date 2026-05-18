package uk.tyrerescue.assistedchat

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
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
 *  1. Keeps the app process alive so FCM urgent booking messages are delivered
 *     to a live process instead of cold-starting a dead one (Samsung One UI
 *     aggressively kills backgrounded apps).
 *  2. Polls the backend every POLL_INTERVAL_MS as a safety net for the case
 *     where FCM delivery is delayed or dropped entirely. If an emergency
 *     booking is detected that the FCM path did not already alert for, the
 *     same full-screen alert is raised via UrgentAlertNotifier.
 *
 * Restart strategy:
 *   - START_STICKY restarts the service after process death (unless the user
 *     Force Stopped the app, which is an accepted limitation).
 *   - onTaskRemoved schedules a one-shot AlarmManager restart in case the OS
 *     does not re-deliver the START_STICKY intent quickly.
 *   - BootReceiver re-arms the service after reboot if armed=true.
 */
class UrgentAlertWatcherService : Service() {

  private val pollExecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
  private val polling = AtomicBoolean(false)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureWatcherChannel()
    val notification = buildNotification()
    startForeground(NOTIF_ID, notification)
    writeArmed(this, true)
    writeArmedSince(this, System.currentTimeMillis())
    Log.i(TAG, "Urgent watcher service started")
    startPollingLoop()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      Log.i(TAG, "Stop requested")
      writeArmed(this, false)
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    // stopWithTask=false in the manifest already keeps the service alive
    // when the task is swiped away. Defensive AlarmManager restart in case
    // the OS terminates the process shortly after.
    if (readArmed(this)) {
      try {
        val restartIntent = Intent(applicationContext, UrgentAlertWatcherService::class.java).apply {
          action = ACTION_START
        }
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val pi = PendingIntent.getService(applicationContext, 1001, restartIntent, flags)
        val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + 5_000L, pi)
        Log.i(TAG, "onTaskRemoved scheduled restart in 5s")
      } catch (err: Exception) {
        Log.w(TAG, "Failed to schedule restart in onTaskRemoved", err)
      }
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    try {
      pollExecutor.shutdownNow()
    } catch (_: Exception) {
      // ignore
    }
    Log.i(TAG, "Urgent watcher service destroyed")
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
      Log.w(TAG, "Failed to schedule polling loop", err)
    }
  }

  private fun pollOnce() {
    if (!polling.compareAndSet(false, true)) return
    try {
      val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val token = prefs.getString(PREFS_AUTH_TOKEN_KEY, null)?.takeIf { it.isNotBlank() }
      val baseUrl = prefs.getString(PREFS_API_BASE_KEY, null)?.takeIf { it.isNotBlank() }
      if (token == null || baseUrl == null) {
        // Not yet armed with auth — silently skip.
        return
      }

      val armedSince = prefs.getLong(PREFS_ARMED_SINCE_KEY, 0L)
      val lastAlertedId = prefs.getString(PREFS_LAST_ALERTED_ID_KEY, null) ?: ""

      val url = URL("${baseUrl.trimEnd('/')}/api/mobile/admin/urgent-poll?since=$armedSince")
      val conn = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "application/json")
        connectTimeout = 8_000
        readTimeout = 8_000
      }

      val status = conn.responseCode
      if (status == 401 || status == 403) {
        Log.w(TAG, "Poll auth rejected status=$status — clearing token")
        prefs.edit().remove(PREFS_AUTH_TOKEN_KEY).apply()
        try { conn.disconnect() } catch (_: Exception) {}
        return
      }
      if (status != 200) {
        Log.w(TAG, "Poll non-200 status=$status")
        try { conn.disconnect() } catch (_: Exception) {}
        return
      }

      val body = BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
      try { conn.disconnect() } catch (_: Exception) {}

      val json = JSONObject(body)
      val booking = json.optJSONObject("booking") ?: return
      val bookingId = booking.optString("id", "").takeIf { it.isNotBlank() } ?: return
      if (bookingId == lastAlertedId) {
        return
      }

      Log.i(TAG, "Poll detected urgent booking id suffix=${bookingId.takeLast(8)}")
      recordAlertedBooking(this, bookingId)

      UrgentAlertNotifier.postAlert(
        this,
        UrgentAlertNotifier.UrgentPayload(
          bookingId = bookingId,
          title = booking.optString("title", "Emergency booking received"),
          body = booking.optString("body", "A new emergency booking needs immediate action."),
          customerPhone = booking.optString("customerPhone", "").takeIf { it.isNotBlank() },
          createdAt = booking.optString("createdAt", "").takeIf { it.isNotBlank() },
        ),
        sourceTag = "poll",
      )
    } catch (err: Exception) {
      Log.w(TAG, "Poll failed: ${err.message}")
    } finally {
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
      .setContentTitle("Urgent alerts active")
      .setContentText("Listening for emergency bookings")
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
      "Alert watcher",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Keeps urgent booking alerts active"
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    nm.createNotificationChannel(channel)
  }

  companion object {
    private const val TAG = "UrgentAlertWatcherService"
    const val CHANNEL_ID = "urgent_watcher_v1"
    const val NOTIF_ID = 7001
    const val ACTION_START = "uk.tyrerescue.assistedchat.URGENT_WATCHER_START"
    const val ACTION_STOP = "uk.tyrerescue.assistedchat.URGENT_WATCHER_STOP"
    const val PREFS_NAME = "urgent_alert_prefs"
    const val PREFS_ARMED_KEY = "armed"
    const val PREFS_ARMED_SINCE_KEY = "armed_since"
    const val PREFS_AUTH_TOKEN_KEY = "auth_token"
    const val PREFS_API_BASE_KEY = "api_base"
    const val PREFS_LAST_ALERTED_ID_KEY = "last_alerted_booking_id"

    private const val INITIAL_DELAY_MS = 10_000L
    private const val POLL_INTERVAL_MS = 20_000L

    fun start(context: Context) {
      val intent = Intent(context, UrgentAlertWatcherService::class.java).apply {
        action = ACTION_START
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (err: Exception) {
        Log.e(TAG, "Failed to start watcher service", err)
      }
    }

    fun stop(context: Context) {
      try {
        // Mark disarmed BEFORE stopping so BootReceiver does not re-arm
        // after a reboot. Also reset armed_since so the next arm uses a
        // fresh polling baseline.
        writeArmed(context, false)
        try {
          context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(PREFS_ARMED_SINCE_KEY)
            .remove(PREFS_LAST_ALERTED_ID_KEY)
            .apply()
        } catch (_: Exception) {
          // ignore
        }
        try {
          val stopIntent = Intent(context, UrgentAlertWatcherService::class.java).apply {
            action = ACTION_STOP
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(stopIntent)
          } else {
            context.startService(stopIntent)
          }
        } catch (_: Exception) {
          // Service may not be running; fall through to stopService.
        }
        context.stopService(Intent(context, UrgentAlertWatcherService::class.java))
      } catch (err: Exception) {
        Log.e(TAG, "Failed to stop watcher service", err)
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
        Log.w(TAG, "Failed to write watcher auth", err)
      }
    }

    fun clearAuth(context: Context) {
      try {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .remove(PREFS_AUTH_TOKEN_KEY)
          .remove(PREFS_API_BASE_KEY)
          .remove(PREFS_LAST_ALERTED_ID_KEY)
          .apply()
      } catch (err: Exception) {
        Log.w(TAG, "Failed to clear watcher auth", err)
      }
    }

    fun recordAlertedBooking(context: Context, bookingId: String) {
      try {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit()
          .putString(PREFS_LAST_ALERTED_ID_KEY, bookingId)
          .apply()
      } catch (err: Exception) {
        Log.w(TAG, "Failed to record alerted booking", err)
      }
    }

    private fun readArmed(context: Context): Boolean {
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
        Log.w(TAG, "Failed to write armed=$armed flag", err)
      }
    }

    private fun writeArmedSince(context: Context, ts: Long) {
      try {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        // Only set armed_since on the first arm so polling does not flood
        // the user with old bookings if the service restarts.
        if (prefs.getLong(PREFS_ARMED_SINCE_KEY, 0L) == 0L) {
          prefs.edit().putLong(PREFS_ARMED_SINCE_KEY, ts).apply()
        }
      } catch (err: Exception) {
        Log.w(TAG, "Failed to write armed_since", err)
      }
    }
  }
}
