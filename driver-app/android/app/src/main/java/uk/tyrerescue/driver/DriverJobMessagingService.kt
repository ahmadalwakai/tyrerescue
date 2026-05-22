package uk.tyrerescue.driver

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Native FCM handler for driver job alerts. Replaces Expo's default
 * FirebaseMessagingService so we can attach a full-screen-intent and
 * wake the screen over the lock screen.
 *
 * Only data-only messages with data.type == "driver_new_job" are handled
 * here. Any other payload is ignored so unrelated push paths are unaffected.
 */
class DriverJobMessagingService : FirebaseMessagingService() {

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    super.onMessageReceived(remoteMessage)

    try {
      val data = remoteMessage.data
      val messageId = remoteMessage.messageId ?: "unknown"
      val rawType = data["type"] ?: "missing"
      val dataKeys = data.keys.sorted().joinToString(",")

      Log.i(TAG, "DRIVER_FCM_MESSAGE_RECEIVED messageId=$messageId from=${remoteMessage.from ?: "unknown"} type=$rawType priority=${remoteMessage.priority} originalPriority=${remoteMessage.originalPriority} keys=$dataKeys")
      Log.i(TAG, "[native-fcm] onMessageReceived messageId=$messageId from=${remoteMessage.from ?: "unknown"}")
      Log.i(TAG, "[native-fcm] data keys=$dataKeys type=$rawType priority=${remoteMessage.priority} originalPriority=${remoteMessage.originalPriority}")

      // Accept canonical type plus legacy aliases the backend may have emitted
      // historically. All normalize internally to "driver_new_job" so the
      // alert path is identical regardless of producer.
      val accepted = ACCEPTED_TYPES.contains(rawType)
      if (!accepted) {
        // Log every key when ignored so payload mismatches surface in logcat.
        for ((k, v) in data) {
          Log.i(TAG, "[native-fcm] ignored key=$k value=${v.take(120)}")
        }
        Log.i(TAG, "[native-fcm] ignored type=$rawType (no match) keys=$dataKeys")
        return
      }

      Log.i(TAG, "[native-fcm] driver_new_job accepted (rawType=$rawType)")
      Log.i(TAG, "DRIVER_FCM_URGENT_JOB_PARSED rawType=$rawType refSuffix=${(data["ref"] ?: data["bookingRef"] ?: data["jobRef"] ?: "unknown").takeLast(8)}")

      val ref = data["ref"] ?: data["bookingRef"] ?: data["jobRef"]
      val jobId = data["jobId"]
      val assignmentId = data["assignmentId"]
      val title = data["title"] ?: "New job assigned"
      val body = data["body"] ?: "Tap to view the assigned job."
      val address = data["address"] ?: data["location"]
      val deepLink = data["url"] ?: data["deepLink"]
      val amountToCollectPence = data["amountToCollectPence"] ?: data["collectAmount"]
      val paymentStatus = data["paymentStatus"]
      val paymentType = data["paymentType"]
      val jobPricePence = data["jobPricePence"] ?: data["price"]

      DriverJobAlertNotifier.postAlert(
        this,
        DriverJobAlertNotifier.JobAlertPayload(
          ref = ref,
          jobId = jobId,
          assignmentId = assignmentId,
          title = title,
          body = body,
          address = address,
          deepLink = deepLink,
          amountToCollectPence = amountToCollectPence,
          paymentStatus = paymentStatus,
          paymentType = paymentType,
          jobPricePence = jobPricePence,
        ),
        sourceTag = "fcm",
      )
    } catch (err: Exception) {
      Log.e(TAG, "Failed to handle driver job message", err)
    }
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    val suffix = token.takeLast(8)
    Log.i(TAG, "DRIVER_FCM_TOKEN_REFRESHED suffix=$suffix")
    // Persist token + dirty flag so the JS layer's next register tick (every
    // 30s while logged in) re-uploads to the backend even if the cached
    // device token has since rotated. This is belt-and-braces; expo's
    // getDevicePushTokenAsync will also return the fresh token directly.
    try {
      applicationContext
        .getSharedPreferences(DriverAlertWatcherService.PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString("last_fcm_token", token)
        .putLong("last_fcm_token_at", System.currentTimeMillis())
        .putBoolean("fcm_token_dirty", true)
        .apply()
    } catch (err: Exception) {
      Log.w(TAG, "failed to persist refreshed FCM token", err)
    }
  }

  companion object {
    private const val TAG = "DriverJobMessagingService"

    /**
     * Accepted "type" values for the new-driver-job alert path. The first
     * entry is the canonical value; the remainder are legacy aliases that
     * different backend versions or relay paths may have emitted. Any of
     * these is normalised to driver_new_job at the alert layer.
     */
    private val ACCEPTED_TYPES: Set<String> = setOf(
      "driver_new_job",
      "JOB_ASSIGNED",
      "DRIVER_JOB_ASSIGNED",
      "new_driver_job",
      // Backend's internal eventType values that mean the same thing —
      // include them defensively so a future routing change can't silently
      // drop the alert.
      "new_job",
      "job_assigned",
      "new_assignment",
      "reassignment",
    )
  }
}
