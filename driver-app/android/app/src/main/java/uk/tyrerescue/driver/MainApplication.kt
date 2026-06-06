package uk.tyrerescue.driver

import android.app.Activity
import android.app.Application
import android.content.res.Configuration
import android.os.Bundle
import java.util.concurrent.atomic.AtomicInteger

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(DriverAlertWatcherPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)

    // Track how many activities are currently resumed so native alert code can
    // tell whether the app is genuinely in the foreground. A direct
    // startActivity() for the lock-screen alert is blocked by Background
    // Activity Launch rules when the app is backgrounded, so we only attempt it
    // while foreground and otherwise rely on the full-screen-intent notification.
    registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
      override fun onActivityResumed(activity: Activity) {
        resumedActivities.incrementAndGet()
      }

      override fun onActivityPaused(activity: Activity) {
        resumedActivities.updateAndGet { if (it > 0) it - 1 else 0 }
      }

      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
      override fun onActivityStarted(activity: Activity) {}
      override fun onActivityStopped(activity: Activity) {}
      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
      override fun onActivityDestroyed(activity: Activity) {}
    })

    // Re-arm the driver alert watcher whenever the process starts and the
    // driver is still logged in. Cheap no-op if unarmed.
    try {
      if (DriverAlertWatcherService.readArmed(this)) {
        DriverAlertWatcherService.start(this)
      }
    } catch (_: Exception) {
      // Best-effort; never crash the host app.
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  companion object {
    private val resumedActivities = AtomicInteger(0)

    /** True when at least one activity is resumed (app is in the foreground). */
    fun isAppForeground(): Boolean = resumedActivities.get() > 0
  }
}
