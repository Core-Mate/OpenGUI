package com.coremate.opengui.common.utils

import android.content.Context
import com.google.gson.Gson

/**
 * Automation script configuration manager.
 * Caches and reads automation script parameter configuration locally.
 */
object AutomationConfigManager {

    private const val PREFS_NAME = "automation_configs"
    private val gson = Gson()

    /**
 * Save configuration for the specified script.
 * @param context application context.
 * @param script Name unique script name used as the Shared Preferences key.
 * @param config script configuration object.
     */
    fun <T> saveConfig(context: Context, scriptName: String, config: T) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val jsonString = gson.toJson(config)
        prefs.edit().putString(scriptName, jsonString).apply()
        AndroidLogger().info("AutomationConfigManager", "Saved config for $scriptName: $jsonString")
    }

    /**
 * Read configuration for the specified script.
 * @param context application context.
 * @param script Name unique script name used as the Shared Preferences key.
 * @param class OfT Class type for the configuration object.
 * @return matching configuration object, or null when absent.
     */
    fun <T> loadConfig(context: Context, scriptName: String, classOfT: Class<T>): T? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val jsonString = prefs.getString(scriptName, null)
        AndroidLogger().info("AutomationConfigManager", "Loaded config for $scriptName: $jsonString")
        return if (jsonString != null) {
            try {
                gson.fromJson(jsonString, classOfT)
            } catch (e: Exception) {
                AndroidLogger().error("AutomationConfigManager", "Failed to parse config for $scriptName", e)
                null
            }
        } else {
            null
        }
    }

    // Helper: clear configuration for one script
    fun clearConfig(context: Context, scriptName: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(scriptName).apply()
        AndroidLogger().info("AutomationConfigManager", "Cleared config for $scriptName")
    }

    // Helper: clear all configuration; use with care
    fun clearAllConfigs(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
        AndroidLogger().info("AutomationConfigManager", "Cleared all automation configs.")
    }
}