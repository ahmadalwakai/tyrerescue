package uk.tyrerescue.adminalert

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Entry point.
 *
 * On first launch: routes to SetupActivity so the user can grant
 * notification permission and confirm Android settings.
 *
 * On subsequent launches: shows SetupActivity as the home screen —
 * the app is a companion alert tool, not a full workflow app.
 *
 * When a push notification is tapped the system opens AlertActivity
 * directly via the intent filter defined in AndroidManifest.xml.
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Always forward to the Setup screen as the main UI.
        // AlertActivity is only reached by tapping a notification.
        startActivity(Intent(this, SetupActivity::class.java))
        finish()
    }
}
