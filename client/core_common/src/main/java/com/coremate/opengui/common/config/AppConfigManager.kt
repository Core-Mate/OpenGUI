package com.coremate.opengui.common.config

import android.util.Log
import com.google.gson.Gson

class AppConfigManager {
    companion object {
        val instance by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            AppConfigManager()
        }
    }

    private var appConfig: AppConfigData? = null

    fun updateConfig(appConfig: AppConfigData?) {
        this.appConfig = appConfig
    }

    fun getSupportApp(): MutableMap<String, String>? {
        appConfig?.supportApp?.let { supportApps ->
            val supportAppMap = mutableMapOf<String, String>()
            for (app in supportApps) {
                supportAppMap[app.appName] = app.`package`
            }
            return supportAppMap
        }
        return null
    }
}