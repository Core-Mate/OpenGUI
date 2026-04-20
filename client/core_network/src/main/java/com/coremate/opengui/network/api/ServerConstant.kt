package com.coremate.opengui.network.api

import com.coremate.opengui.network.BuildConfig
import com.tencent.mmkv.MMKV

object ServerConstant {
    // Default to localhost — works with both:
    // - Android emulator (10.0.2.2 maps to host, but 127.0.0.1 works with adb reverse)
    // - Physical devices (use adb reverse tcp:7777 tcp:7777)
    // - For physical devices without adb reverse, change in Settings page
    const val BASE_URL_DEBUG = "http://127.0.0.1:7777"
    const val BASE_URL_RELEASE = "http://127.0.0.1:7777"

    fun getURL(): String {
        val mmkv = MMKV.mmkvWithID("BaseUrl")
        val baseUrl = mmkv.getString("BaseUrl", null)
        return if (BuildConfig.DEBUG) {
            baseUrl ?: BASE_URL_DEBUG
        } else {
            BASE_URL_RELEASE
        }
    }
}