package uk.tyrerescue.driver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Re-arms the driver alert watcher service after device reboot or HTC/Samsung
 * fast-boot. Only re-starts when the user is currently logged in (armed=true
 * persisted in SharedPreferences). Keeps the contract: nothing happens before
 * a successful login.
 */
class DriverAlertBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED &&
      action != "android.intent.action.QUICKBOOT_POWERON" &&
      action != "com.htc.intent.action.QUICKBOOT_POWERON"
    ) {
      return
    }
    if (!DriverAlertWatcherService.readArmed(context)) {
      Log.i(TAG, "[driver-watcher] boot received — not armed, ignoring")
      return
    }
    Log.i(TAG, "[driver-watcher] boot received — re-arming watcher")
    try {
      DriverAlertWatcherService.start(context)
    } catch (err: Exception) {
      Log.w(TAG, "[driver-watcher] boot re-arm failed", err)
    }
  }

  private companion object {
    const val TAG = "DriverAlertBoot"
  }
}
