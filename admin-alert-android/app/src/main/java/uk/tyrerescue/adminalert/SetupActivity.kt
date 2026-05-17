package uk.tyrerescue.adminalert

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import uk.tyrerescue.adminalert.notifications.NotificationHelper

/**
 * Setup screen.
 *
 * Shows:
 *   - Notification permission status
 *   - FCM token (with Copy button)
 *   - Battery optimisation advice
 *   - Open app settings button
 *   - Test local urgent alert button
 *
 * The FCM token displayed here must be registered in the backend so the
 * server can send targeted urgent booking pushes to this device.
 * See docs/admin-alert-native-setup.md for backend registration instructions.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var tvPermissionStatus: TextView
    private lateinit var tvFcmToken: TextView
    private lateinit var btnCopyToken: Button
    private lateinit var btnOpenSettings: Button
    private lateinit var btnTestAlert: Button

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            updatePermissionStatus(granted)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        tvPermissionStatus = findViewById(R.id.tv_permission_status)
        tvFcmToken         = findViewById(R.id.tv_fcm_token)
        btnCopyToken       = findViewById(R.id.btn_copy_token)
        btnOpenSettings    = findViewById(R.id.btn_open_settings)
        btnTestAlert       = findViewById(R.id.btn_test_alert)

        btnCopyToken.setOnClickListener { copyFcmToken() }
        btnOpenSettings.setOnClickListener { openAppSettings() }
        btnTestAlert.setOnClickListener { testLocalAlert() }
    }

    override fun onResume() {
        super.onResume()
        checkPermissionAndRequest()
        loadFcmToken()
    }

    // ─── Permission ───────────────────────────────────────────────────────────

    private fun checkPermissionAndRequest() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED

            if (granted) {
                updatePermissionStatus(true)
            } else {
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        } else {
            // Android < 13: permission not required at runtime
            updatePermissionStatus(true)
        }
    }

    private fun updatePermissionStatus(granted: Boolean) {
        tvPermissionStatus.text = if (granted) {
            getString(R.string.permission_granted)
        } else {
            getString(R.string.permission_denied)
        }
    }

    // ─── FCM Token ────────────────────────────────────────────────────────────

    private fun loadFcmToken() {
        tvFcmToken.text = getString(R.string.fcm_token_loading)
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                tvFcmToken.text = getString(R.string.fcm_token_error)
                return@addOnCompleteListener
            }
            val token = task.result ?: ""
            // Store for copy button
            tvFcmToken.tag = token
            // Show truncated version for readability
            tvFcmToken.text = if (token.length > 40) {
                token.take(20) + "…" + token.takeLast(20)
            } else {
                token
            }
        }
    }

    private fun copyFcmToken() {
        val token = tvFcmToken.tag as? String ?: return
        if (token.isEmpty()) {
            Toast.makeText(this, getString(R.string.fcm_token_not_ready), Toast.LENGTH_SHORT).show()
            return
        }
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("FCM Token", token))
        Toast.makeText(this, getString(R.string.fcm_token_copied), Toast.LENGTH_SHORT).show()
    }

    // ─── App Settings ─────────────────────────────────────────────────────────

    private fun openAppSettings() {
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", packageName, null)
        })
    }

    // ─── Test Alert ───────────────────────────────────────────────────────────

    private fun testLocalAlert() {
        NotificationHelper.showUrgentBookingNotification(
            context      = this,
            bookingId    = "TEST-001",
            customerPhone = "+44 7700 900123",
            createdAt    = "Now",
        )
        Toast.makeText(this, getString(R.string.test_alert_sent), Toast.LENGTH_SHORT).show()
    }
}
