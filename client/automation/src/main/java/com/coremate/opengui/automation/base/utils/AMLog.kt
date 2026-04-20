package com.coremate.opengui.automation.base.utils

import android.util.Log
import com.coremate.opengui.automation.BuildConfig

class AMLog {

    companion object {
        /**
         * 仅做调试打印
         */
        fun onEDebugLog(log: String) {
            if (BuildConfig.DEBUG) {
                var message = ""
                message = "${log} - 线程:${Thread.currentThread().name}"
                Log.e("AMLog => E", message)
            }
        }
    }

}