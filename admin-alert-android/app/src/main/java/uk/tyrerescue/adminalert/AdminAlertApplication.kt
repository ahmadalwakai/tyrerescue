package uk.tyrerescue.adminalert

import android.app.Application
import uk.tyrerescue.adminalert.notifications.NotificationHelper

/**
 * Application class — creates the urgent bookings notification channel
 * on every app start. Channel creation is idempotent on Android 8+.
 */
class AdminAlertApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.createChannels(this)
    }
}
