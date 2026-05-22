package uk.tyrerescue.adminalert.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import uk.tyrerescue.adminalert.AlertActivity
import uk.tyrerescue.adminalert.R
import java.util.concurrent.atomic.AtomicInteger

/**
 * Creates Android notification channels and posts urgent booking notifications.
 *
 * Channel: urgent_bookings_v1
 * ─────────────────────────────
 * Importance : IMPORTANCE_HIGH (heads-up notification)
 * Sound      : res/raw/urgent_booking.wav if present, else system default
 * Vibration  : 0ms pause, 500ms on, 250ms pause, 500ms on, 250ms pause, 900ms on
 * Visibility : PUBLIC (shown on lock screen)
 *
 * IMPORTANT — Android channel immutability:
 * Once a channel is created on a device the sound and importance CANNOT be
 * changed for the same channel id. Uninstalling the app resets this.
 * If you need to change the sound/importance, bump the channel id
 * (e.g. urgent_bookings_v2) and update all references including the
 * backend FCM payload.
 */
object NotificationHelper {

    const val CHANNEL_URGENT_BOOKINGS = "urgent_bookings_v1"
    private const val CHANNEL_NAME    = "Urgent bookings"

    // Vibration pattern: [delay, on, off, on, off, on] in milliseconds
    private val VIBRATION_PATTERN = longArrayOf(0, 500, 250, 500, 250, 900)

    private val notificationIdCounter = AtomicInteger(1000)

    // ─── Channel Setup ────────────────────────────────────────────────────────

    /**
     * Creates all notification channels. Call from Application.onCreate().
     * Channel creation is idempotent — safe to call on every app start.
     */
    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE)
            as NotificationManager

        nm.createNotificationChannel(buildUrgentChannel(context))
    }

    private fun buildUrgentChannel(context: Context): NotificationChannel {
        val channel = NotificationChannel(
            CHANNEL_URGENT_BOOKINGS,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description          = "Urgent new customer bookings requiring immediate attention"
            enableVibration(true)
            vibrationPattern      = VIBRATION_PATTERN
            lockscreenVisibility  = NotificationCompat.VISIBILITY_PUBLIC
            setShowBadge(true)
        }

        // Attach custom sound if the wav file exists in res/raw
        val soundUri = resolveUrgentSoundUri(context)
        if (soundUri != null) {
            val audioAttrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            channel.setSound(soundUri, audioAttrs)
        }

        return channel
    }

    /**
     * Resolves the URI for urgent_booking.wav from res/raw.
     * Returns null if the file is not bundled, triggering Android's default sound.
     */
    private fun resolveUrgentSoundUri(context: Context): Uri? {
        val resId = context.resources.getIdentifier(
            "urgent_booking", "raw", context.packageName
        )
        if (resId == 0) return null
        return Uri.parse(
            "android.resource://${context.packageName}/$resId"
        )
    }

    // ─── Post Notification ────────────────────────────────────────────────────

    /**
     * Posts a high-importance urgent booking notification.
     *
     * Tapping the notification opens AlertActivity with the booking details.
     */
    fun showUrgentBookingNotification(
        context: Context,
        bookingId: String,
        title: String = "Emergency booking received",
        body: String = "Open Assisted Chat now",
        customerPhone: String = "",
        createdAt: String = "",
    ) {
        val tapIntent = Intent(context, AlertActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(AlertActivity.EXTRA_BOOKING_ID,     bookingId)
            putExtra(AlertActivity.EXTRA_CUSTOMER_PHONE, customerPhone)
            putExtra(AlertActivity.EXTRA_CREATED_AT,     createdAt)
        }

        val tapPending = PendingIntent.getActivity(
            context,
            notificationIdCounter.get(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // "Open booking" action
        val openIntent = PendingIntent.getActivity(
            context,
            notificationIdCounter.get() + 1,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        // "Acknowledge" action — just dismisses the notification
        val ackIntent = Intent(context, AlertActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
            putExtra("action", "acknowledge")
            putExtra(AlertActivity.EXTRA_BOOKING_ID, bookingId)
        }
        val ackPending = PendingIntent.getActivity(
            context,
            notificationIdCounter.get() + 2,
            ackIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val soundUri = resolveUrgentSoundUri(context)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        // Full-screen intent: launches AlertActivity over the lockscreen when
        // the screen is off / the device is locked. Without this, Android only
        // shows a heads-up notification and the operator may miss the alert.
        // Android 14+ requires the USE_FULL_SCREEN_INTENT permission to be
        // granted manually — see SetupActivity for the grant prompt.
        val fullScreenIntent = Intent(context, AlertActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(AlertActivity.EXTRA_BOOKING_ID,     bookingId)
            putExtra(AlertActivity.EXTRA_CUSTOMER_PHONE, customerPhone)
            putExtra(AlertActivity.EXTRA_CREATED_AT,     createdAt)
            putExtra("fullScreen", true)
        }
        val fullScreenPending = PendingIntent.getActivity(
            context,
            notificationIdCounter.get() + 3,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_URGENT_BOOKINGS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(buildDetailText(bookingId, customerPhone, createdAt)))
            .setContentIntent(tapPending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setVibrate(VIBRATION_PATTERN)
            .setSound(soundUri)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(fullScreenPending, true)
            .addAction(
                R.drawable.ic_notification,
                "Open booking",
                openIntent,
            )
            .addAction(
                R.drawable.ic_notification,
                "Acknowledge",
                ackPending,
            )
            .build()

        val nm = NotificationManagerCompat.from(context)
        val notifId = notificationIdCounter.getAndIncrement()
        try {
            nm.notify(notifId, notification)
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS permission not granted
            android.util.Log.w("NotificationHelper", "Cannot post notification: ${e.message}")
        }
    }

    private fun buildDetailText(bookingId: String, customerPhone: String, createdAt: String): String {
        val lines = mutableListOf<String>()
        if (bookingId.isNotEmpty())     lines.add("Booking: $bookingId")
        if (customerPhone.isNotEmpty()) lines.add("Phone: $customerPhone")
        if (createdAt.isNotEmpty())     lines.add("Received: $createdAt")
        return lines.joinToString("\n").ifEmpty { "Open Assisted Chat now" }
    }
}
