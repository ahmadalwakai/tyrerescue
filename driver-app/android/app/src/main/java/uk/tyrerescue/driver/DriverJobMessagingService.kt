package uk.tyrerescue.driver

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
      val dataType = data["type"] ?: "missing"
      val dataKeys = data.keys.sorted().joinToString(",")

      Log.i(TAG, "[native-fcm] onMessageReceived messageId=$messageId from=${remoteMessage.from ?: "unknown"}")
      Log.i(TAG, "[native-fcm] data keys=$dataKeys type=$dataType")

      if (dataType != "driver_new_job") {
        Log.i(TAG, "[native-fcm] ignored type=$dataType")
        return
      }

      Log.i(TAG, "[native-fcm] driver_new_job accepted")

      val ref = data["ref"] ?: data["bookingRef"]
      val title = data["title"] ?: "New job assigned"
      val body = data["body"] ?: "Tap to view the assigned job."
      val address = data["address"]
      val deepLink = data["url"]
      val amountToCollectPence = data["amountToCollectPence"]
      val paymentStatus = data["paymentStatus"]

      DriverJobAlertNotifier.postAlert(
        this,
        DriverJobAlertNotifier.JobAlertPayload(
          ref = ref,
          title = title,
          body = body,
          address = address,
          deepLink = deepLink,
          amountToCollectPence = amountToCollectPence,
          paymentStatus = paymentStatus,
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
    Log.i(TAG, "FCM token refreshed, suffix=$suffix")
  }

  companion object {
    private const val TAG = "DriverJobMessagingService"
  }
}
