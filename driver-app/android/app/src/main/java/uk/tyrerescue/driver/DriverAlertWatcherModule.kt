package uk.tyrerescue.driver

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * React Native bridge for the driver alert watcher service.
 *
 * JS exposes `startWatcher(apiBase, token)` after a successful login, and
 * `stopWatcher()` on logout. The remaining methods drive the setup UI on
 * the profile screen.
 */
class DriverAlertWatcherModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun startWatcher(apiBase: String, token: String, promise: Promise) {
    try {
      val ctx: Context = reactApplicationContext.applicationContext
      DriverAlertWatcherService.setAuth(ctx, token, apiBase)
      DriverAlertWatcherService.start(ctx)
      promise.resolve(true)
    } catch (err: Exception) {
      promise.reject("E_START_FAIL", err)
    }
  }

  @ReactMethod
  fun stopWatcher(promise: Promise) {
    try {
      val ctx: Context = reactApplicationContext.applicationContext
      DriverAlertWatcherService.clearAuth(ctx)
      DriverAlertWatcherService.stop(ctx)
      promise.resolve(true)
    } catch (err: Exception) {
      promise.reject("E_STOP_FAIL", err)
    }
  }

  @ReactMethod
  fun isArmed(promise: Promise) {
    try {
      val ctx: Context = reactApplicationContext.applicationContext
      promise.resolve(DriverAlertWatcherService.readArmed(ctx))
    } catch (err: Exception) {
      promise.reject("E_STATE_FAIL", err)
    }
  }

  @ReactMethod
  fun canUseFullScreenIntent(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        promise.resolve(true)
        return
      }
      val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      promise.resolve(nm.canUseFullScreenIntent())
    } catch (err: Exception) {
      promise.reject("E_FSI_CHECK", err)
    }
  }

  @ReactMethod
  fun openFullScreenAlertSettings(promise: Promise) {
    try {
      val ctx: Context = reactApplicationContext.applicationContext
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
          data = Uri.parse("package:${ctx.packageName}")
        }
      } else {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
          putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
        }
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
      promise.resolve(true)
    } catch (err: Exception) {
      promise.reject("E_FSI_OPEN", err)
    }
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    try {
      val ctx: Context = reactApplicationContext.applicationContext
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      promise.resolve(pm.isIgnoringBatteryOptimizations(ctx.packageName))
    } catch (err: Exception) {
      promise.reject("E_BATT_CHECK", err)
    }
  }

  @ReactMethod
  fun openBatterySettings(promise: Promise) {
    try {
      val ctx: Context = reactApplicationContext.applicationContext
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${ctx.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        ctx.startActivity(intent)
      } catch (_: Exception) {
        val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(fallback)
      }
      promise.resolve(true)
    } catch (err: Exception) {
      promise.reject("E_BATT_OPEN", err)
    }
  }

  @ReactMethod
  fun simulateAlert(promise: Promise) {
    try {
      val ctx: Context = reactApplicationContext.applicationContext
      DriverJobAlertNotifier.postAlert(
        ctx,
        DriverJobAlertNotifier.JobAlertPayload(
          ref = "TEST-${System.currentTimeMillis().toString().takeLast(6)}",
          title = "Test alert",
          body = "This is a test driver alert",
          address = "Test address",
          deepLink = null,
        ),
        sourceTag = "manual-test",
      )
      promise.resolve(true)
    } catch (err: Exception) {
      promise.reject("E_TEST_ALERT", err)
    }
  }

  companion object {
    const val NAME = "DriverAlertWatcher"
  }
}
