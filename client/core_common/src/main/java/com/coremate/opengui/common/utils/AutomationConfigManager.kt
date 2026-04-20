package com.coremate.opengui.common.utils

import android.content.Context
import com.google.gson.Gson

/**
 * 自动化脚本配置管理类。
 * 用于本地缓存和读取自动化脚本的参数配置。
 */
object AutomationConfigManager {

    private const val PREFS_NAME = "automation_configs"
    private val gson = Gson()

    /**
     * 保存指定脚本的配置。
     * @param context 应用上下文。
     * @param scriptName 脚本的唯一名称（作为 SharedPreferences 的 key）。
     * @param config 脚本的配置对象。
     */
    fun <T> saveConfig(context: Context, scriptName: String, config: T) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val jsonString = gson.toJson(config)
        prefs.edit().putString(scriptName, jsonString).apply()
        AndroidLogger().info("AutomationConfigManager", "Saved config for $scriptName: $jsonString")
    }

    /**
     * 读取指定脚本的配置。
     * @param context 应用上下文。
     * @param scriptName 脚本的唯一名称（作为 SharedPreferences 的 key）。
     * @param classOfT 配置对象的 Class 类型。
     * @return 对应的配置对象，如果不存在则返回 null。
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

    // 辅助函数：清除某个脚本的配置
    fun clearConfig(context: Context, scriptName: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(scriptName).apply()
        AndroidLogger().info("AutomationConfigManager", "Cleared config for $scriptName")
    }

    // 辅助函数：清除所有配置 (慎用)
    fun clearAllConfigs(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
        AndroidLogger().info("AutomationConfigManager", "Cleared all automation configs.")
    }
}