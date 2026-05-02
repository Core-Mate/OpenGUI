package com.coremate.opengui.common.launcher

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.widget.Toast
import com.coremate.opengui.common_jvm.utils.Constants

/**
 * A singleton utility object for launching other applications.
 */
object AppLauncher {

    /**
     * Launches an application using its package name.
     *
     * @param context The context to use for launching the intent.
     * @param packageName The package name of the app to launch.
     * @return `true` if the app was launched successfully, `false` otherwise.
     */
    fun launchByPackageName(context: Context, packageName: String): Boolean {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            // App not found, show a toast or log an error
            Toast.makeText(context, "应用未安装: $packageName", Toast.LENGTH_SHORT).show()
            return false
        }

        // Add this flag if you are calling from a non-activity context (like a service)
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        context.startActivity(launchIntent)
        return true
    }

    /**
     * Checks if an application is installed.
     *
     * @param context The context to use.
     * @param packageName The package name to check.
     * @return `true` if the app is installed, `false` otherwise.
     */
    fun isAppInstalled(context: Context, packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Attempts to find the package name of an application given its human-readable name.
     * This is an heuristic and might not be perfectly accurate for all apps.
     *
     * @param context The context to use.
 * @param app Name The human-readable name of the app (e.g., "Douyin", "We Chat").
     * @return The package name if found, or null otherwise.
     */
    fun getPackageNameFromAppName(context: Context, appName: String): String? {
        val packageManager = context.packageManager
        val installedApplications = packageManager.getInstalledApplications(PackageManager.GET_META_DATA)

        // Prefer predefined constant mappings
        val predefinedPackageName = when (appName) {
            "抖音" -> Constants.AppPackageNames.DOUYIN
            "微信" -> Constants.AppPackageNames.WECHAT
            "QQ" -> Constants.AppPackageNames.QQ
            //... Add more predefined mappings
            else -> null
        }
        if (predefinedPackageName != null) {
            return predefinedPackageName
        }

        // Try scanning installed apps and fuzzy-match by app label; slower and less accurate
        for (app in installedApplications) {
            val appLabel = packageManager.getApplicationLabel(app).toString()
            if (appLabel.equals(appName, ignoreCase = true) || // Exact match.
                appLabel.contains(appName, ignoreCase = true)) { // Contains match.
                return app.packageName
            }
        }
        return null
    }
}
