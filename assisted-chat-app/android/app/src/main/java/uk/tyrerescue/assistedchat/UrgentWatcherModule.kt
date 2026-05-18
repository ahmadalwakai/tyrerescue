package uk.tyrerescue.assistedchat

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class UrgentWatcherModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = NAME

  @ReactMethod
  fun startWatcher(promise: Promise) {
    try {
      UrgentAlertWatcherService.start(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WATCHER_START_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun stopWatcher(promise: Promise) {
    try {
      UrgentAlertWatcherService.clearAuth(reactApplicationContext)
      UrgentAlertWatcherService.stop(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WATCHER_STOP_FAILED", e.message, e)
    }
  }

  /**
   * Persist the mobile admin JWT + API base URL so the watcher's polling
   * fallback can authenticate while the JS engine is suspended. Should be
   * called immediately after a successful login and whenever the API base
   * URL changes. Cleared by stopWatcher / clearAuth on logout.
   */
  @ReactMethod
  fun setAuth(token: String, apiBase: String, promise: Promise) {
    try {
      UrgentAlertWatcherService.setAuth(reactApplicationContext, token, apiBase)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WATCHER_SET_AUTH_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun clearAuth(promise: Promise) {
    try {
      UrgentAlertWatcherService.clearAuth(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WATCHER_CLEAR_AUTH_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun canUseFullScreenIntent(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val nm = reactApplicationContext.getSystemService(NotificationManager::class.java)
        promise.resolve(nm?.canUseFullScreenIntent() ?: false)
      } else {
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun openFullScreenIntentSettings(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val pkg = ctx.packageName
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
          data = Uri.parse("package:$pkg")
        }
      } else {
        // Pre-API 34: send the user to the app's notification settings page.
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
          putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
        }
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      // Fallback: app details page.
      try {
        val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${reactApplicationContext.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(fallback)
        promise.resolve(true)
      } catch (err: Exception) {
        promise.reject("OPEN_SETTINGS_FAILED", err.message, err)
      }
    }
  }

  companion object {
    const val NAME = "UrgentWatcherModule"
  }
}
