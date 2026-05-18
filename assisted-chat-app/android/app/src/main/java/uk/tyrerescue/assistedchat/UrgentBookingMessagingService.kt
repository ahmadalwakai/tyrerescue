package uk.tyrerescue.assistedchat

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class UrgentBookingMessagingService : FirebaseMessagingService() {

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    Log.i(TAG, "onMessageReceived entered")
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
      val title = data["title"] ?: "Emergency booking received"
      val body = data["body"] ?: "A new emergency booking needs immediate action."
      val customerPhone = data["customerPhone"]
      val createdAt = data["createdAt"]

      // Record the last alerted booking so the polling fallback in
      // UrgentAlertWatcherService does not re-alert for the same booking.
      bookingId?.takeIf { it.isNotBlank() }?.let {
        UrgentAlertWatcherService.recordAlertedBooking(this, it)
      }

      UrgentAlertNotifier.postAlert(
        this,
        UrgentAlertNotifier.UrgentPayload(
          bookingId = bookingId,
          title = title,
          body = body,
          customerPhone = customerPhone,
          createdAt = createdAt,
        ),
        sourceTag = "fcm",
      )
    } catch (err: Exception) {
      Log.e(TAG, "Failed to handle urgent booking message", err)
    }
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    val suffix = token.takeLast(8)
    Log.i(TAG, "FCM token refreshed, suffix=$suffix")
  }

  companion object {
    private const val TAG = "UrgentBookingMessagingService"
  }
}
