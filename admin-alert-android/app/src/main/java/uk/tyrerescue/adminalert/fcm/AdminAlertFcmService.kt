package uk.tyrerescue.adminalert.fcm

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import uk.tyrerescue.adminalert.notifications.NotificationHelper

/**
 * Firebase Cloud Messaging service for the Admin Alert app.
 *
 * Receives push messages from the Tyre Rescue backend and posts
 * high-importance notifications on the urgent_bookings_v1 channel.
 *
 * Backend payload expected format (FCM HTTP v1 API):
 * {
 *   "token": "FCM_DEVICE_TOKEN",
 *   "notification": {
 *     "title": "Emergency booking received",
 *     "body": "Open Assisted Chat now"
 *   },
 *   "android": {
 *     "priority": "high",
 *     "notification": {
 *       "channel_id": "urgent_bookings_v1",
 *       "sound": "urgent_booking",
 *       "visibility": "public",
 *       "notification_priority": "PRIORITY_MAX"
 *     }
 *   },
 *   "data": {
 *     "type": "urgent_booking",
 *     "bookingId": "BOOKING_UUID",
 *     "customerPhone": "+44 7700 900123",
 *     "createdAt": "2026-05-17T12:00:00Z",
 *     "url": "tyrerescue-assisted://bookings/BOOKING_UUID"
 *   }
 * }
 *
 * IMPORTANT: When the notification payload (notification.title/body) is
 * present, Android delivers the notification automatically via the system
 * tray and the onMessageReceived callback may NOT be invoked when the app
 * is in the background. The channel_id in the android.notification block
 * routes it to urgent_bookings_v1 automatically. onMessageReceived is
 * only guaranteed to be called for data-only messages. Use data-only
 * payloads if you need 100% callback control.
 */
class AdminAlertFcmService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "AdminAlertFcm"
        private const val DATA_TYPE           = "type"
        private const val DATA_BOOKING_ID     = "bookingId"
        private const val DATA_CUSTOMER_PHONE = "customerPhone"
        private const val DATA_CREATED_AT     = "createdAt"
        private const val TYPE_URGENT_BOOKING = "urgent_booking"
    }

    /**
     * Called for data-only messages and when the app is in the foreground.
     * Not called for notification messages when app is in the background/killed.
     */
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        Log.d(TAG, "FCM message received from: ${message.from}")

        val data = message.data
        val type = data[DATA_TYPE]

        if (type != TYPE_URGENT_BOOKING) {
            Log.d(TAG, "Ignoring non-urgent message type: $type")
            return
        }

        val bookingId     = data[DATA_BOOKING_ID] ?: ""
        val customerPhone = data[DATA_CUSTOMER_PHONE] ?: ""
        val createdAt     = data[DATA_CREATED_AT] ?: ""
        // Prefer title/body from data (DATA-ONLY messages) and fall back to
        // the notification block for legacy mixed payloads.
        val title         = data["title"] ?: message.notification?.title ?: "Emergency booking received"
        val body          = data["body"]  ?: message.notification?.body  ?: "Open Assisted Chat now"

        NotificationHelper.showUrgentBookingNotification(
            context       = applicationContext,
            bookingId     = bookingId,
            title         = title,
            body          = body,
            customerPhone = customerPhone,
            createdAt     = createdAt,
        )
    }

    /**
     * Called when a new FCM registration token is generated (first install,
     * token refresh, or app data cleared).
     *
     * The new token must be sent to the Tyre Rescue backend so urgent
     * booking pushes can be delivered to this device.
     *
     * TODO: Implement token upload to the backend here.
     * Endpoint: POST /api/mobile/admin/native-alert-token
     * Body: { "token": "<fcm_token>", "platform": "android" }
     * Auth: Bearer admin JWT (same as the Expo app uses)
     *
     * Until this is implemented, the operator must copy the token manually
     * from the Setup screen and register it in the backend admin panel.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM token refreshed — update backend registration")
        // TODO: call backend to store the new token
    }
}
