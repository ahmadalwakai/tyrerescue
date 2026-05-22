package uk.tyrerescue.adminalert

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * Alert screen.
 *
 * Opened when the operator taps an urgent booking push notification.
 * Displays booking details included in the notification payload and
 * provides quick-action buttons.
 *
 * Expected intent extras (supplied by AdminAlertFcmService):
 *   EXTRA_BOOKING_ID     — booking UUID
 *   EXTRA_CUSTOMER_PHONE — customer phone number (optional)
 *   EXTRA_CREATED_AT     — ISO timestamp string (optional)
 */
class AlertActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_BOOKING_ID     = "bookingId"
        const val EXTRA_CUSTOMER_PHONE = "customerPhone"
        const val EXTRA_CREATED_AT     = "createdAt"

        // Admin booking URL on the web app (fallback when deep link is unavailable)
        private const val WEB_BOOKING_BASE_URL = "https://www.tyrerescue.uk/admin/bookings/"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockscreen()
        setContentView(R.layout.activity_alert)

        val bookingId     = intent.getStringExtra(EXTRA_BOOKING_ID) ?: extractBookingIdFromUri()
        val customerPhone = intent.getStringExtra(EXTRA_CUSTOMER_PHONE) ?: ""
        val createdAt     = intent.getStringExtra(EXTRA_CREATED_AT) ?: ""

        bindViews(bookingId, customerPhone, createdAt)
    }

    /**
     * Launch the Activity over the lockscreen when triggered by a full-screen
     * notification intent. Combines the modern API (Android 8.1+) with the
     * legacy WindowManager flags so older devices behave the same way.
     */
    @Suppress("DEPRECATION")
    private fun showOverLockscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            km?.requestDismissKeyguard(this, null)
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
    }

    // ─── Extract booking id from deep link URI ────────────────────────────────

    private fun extractBookingIdFromUri(): String? {
        val data: Uri? = intent.data
        if (data == null) return null

        // tyrerescue-assisted://bookings/{bookingId}
        // https://www.tyrerescue.uk/admin/bookings/{bookingId}
        val segments = data.pathSegments
        return segments.lastOrNull()
    }

    // ─── Bind UI ──────────────────────────────────────────────────────────────

    private fun bindViews(bookingId: String?, customerPhone: String, createdAt: String) {
        val tvBookingId    = findViewById<TextView>(R.id.tv_booking_id)
        val tvPhone        = findViewById<TextView>(R.id.tv_customer_phone)
        val tvCreatedAt    = findViewById<TextView>(R.id.tv_created_at)
        val btnOpen        = findViewById<Button>(R.id.btn_open_booking)
        val btnAcknowledge = findViewById<Button>(R.id.btn_acknowledge)

        tvBookingId.text = bookingId
            ?: getString(R.string.alert_booking_id_unknown)

        tvPhone.text = customerPhone.ifEmpty {
            getString(R.string.alert_phone_not_included)
        }

        tvCreatedAt.text = createdAt.ifEmpty {
            getString(R.string.alert_created_at_not_included)
        }

        btnOpen.setOnClickListener { openBooking(bookingId) }

        btnAcknowledge.setOnClickListener {
            Toast.makeText(
                this,
                getString(R.string.alert_acknowledged),
                Toast.LENGTH_SHORT
            ).show()
            finish()
        }
    }

    // ─── Open booking ─────────────────────────────────────────────────────────

    private fun openBooking(bookingId: String?) {
        if (bookingId.isNullOrEmpty()) {
            Toast.makeText(
                this,
                getString(R.string.alert_no_booking_id),
                Toast.LENGTH_SHORT
            ).show()
            return
        }

        // Try deep link into the Tyre Rescue Assisted Chat app first.
        // Requires the Expo app to register the "tyrerescue-assisted" scheme.
        // If the scheme is not registered the system falls through to the
        // web fallback below.
        val deepLinkUri = Uri.parse("tyrerescue-assisted://bookings/$bookingId")
        val deepLinkIntent = Intent(Intent.ACTION_VIEW, deepLinkUri)

        if (deepLinkIntent.resolveActivity(packageManager) != null) {
            startActivity(deepLinkIntent)
        } else {
            // Fallback: open booking in the admin web panel
            val webUri = Uri.parse("$WEB_BOOKING_BASE_URL$bookingId")
            startActivity(Intent(Intent.ACTION_VIEW, webUri))
        }
    }
}
