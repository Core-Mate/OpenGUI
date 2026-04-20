package com.coremate.opengui.accessibility.actions

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.coremate.opengui.common.launcher.AppLauncher
import com.coremate.opengui.common_jvm.utils.Constants

/**
 * A class that encapsulates the logic for opening an application and optionally performing
 * a subsequent action after a delay.
 */
class OpenAppAction {

    /**
     * Requests to open an application by its package name.
     * After a configurable delay, an optional callback action can be performed.
     *
     * @param context The Android Context, typically from an Activity or Fragment.
     * @param packageName The package name of the application to open.
     * @param delayMillis The delay in milliseconds after launching the app before the onOpened callback is invoked.
     * Defaults to Constants.Delays.AFTER_APP_LAUNCH_DELAY_MS.
     * @param onOpened An optional lambda function to be executed after the app is launched and the delay has passed.
     * This is useful for performing actions like clicks or types inside the launched app.
     * @return True if the app launch was initiated, false otherwise (e.g., app not found).
     */
    fun perform(
        context: Context,
        packageName: String,
        delayMillis: Long = Constants.Delays.AFTER_APP_LAUNCH_DELAY_MS,
        onOpened: (() -> Unit)? = null // Nullable lambda for optional callback
    ): Boolean {
        val launched = AppLauncher.launchByPackageName(context, packageName)

        if (launched) {
            // If the app was launched successfully, post a delayed action
            Handler(Looper.getMainLooper()).postDelayed({
                onOpened?.invoke() // Invoke the callback if provided
            }, delayMillis)
        }
        return launched
    }
}