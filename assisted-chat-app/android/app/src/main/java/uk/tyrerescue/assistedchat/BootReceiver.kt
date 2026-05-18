package uk.tyrerescue.assistedchat

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Restarts the urgent alert watcher after device reboot, but only if the
 * admin was previously armed (i.e. logged in with token registered).
 *
 * The flag is written by UrgentAlertWatcherService.start()/stop() and by
 * UrgentWatcherModule.startWatcher()/stopWatcher().
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED &&
      action != "android.intent.action.QUICKBOOT_POWERON" &&
      action != "com.htc.intent.action.QUICKBOOT_POWERON"
    ) {
      return
    }

    val prefs = context.getSharedPreferences(
      UrgentAlertWatcherService.PREFS_NAME,
      Context.MODE_PRIVATE,
    )
    val wasArmed = prefs.getBoolean(UrgentAlertWatcherService.PREFS_ARMED_KEY, false)
    Log.i(TAG, "Boot received action=$action wasArmed=$wasArmed")

    if (wasArmed) {
      UrgentAlertWatcherService.start(context)
    }
  }

  companion object {
    private const val TAG = "BootReceiver"
  }
}
