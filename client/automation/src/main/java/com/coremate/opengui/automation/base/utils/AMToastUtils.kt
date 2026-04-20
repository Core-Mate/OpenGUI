package com.coremate.opengui.automation.base.utils

import android.content.Context
import android.widget.Toast
import androidx.annotation.IntDef
import androidx.annotation.StringRes
import com.coremate.opengui.automation.AMServiceManager
import java.lang.annotation.Retention
import java.lang.annotation.RetentionPolicy
import java.lang.ref.WeakReference

class AMToastUtils {

    companion object {

        private var toast: Toast? = null // Global Toast
        private var app: WeakReference<Context>? =
            WeakReference(AMServiceManager.applicationContext)

        @IntDef(Toast.LENGTH_SHORT, Toast.LENGTH_LONG)
        @Retention(RetentionPolicy.SOURCE)
        annotation class Duration

        @JvmStatic
        fun showToast(@StringRes resId: Int) {
            clearToast()
            app?.let {
                toast = Toast.makeText(it.get(), resId, Toast.LENGTH_SHORT)
                toast?.show()
            }
        }

        @JvmStatic
        fun showToast(msg: CharSequence?) {
            clearToast()
            app?.let {
                toast = Toast.makeText(it.get(), msg, Toast.LENGTH_SHORT)
                toast?.show()
            }
        }

        @JvmStatic
        fun showToast(@StringRes resId: Int, @Duration duration: Int) {
            clearToast()
            app?.let {
                toast = Toast.makeText(it.get(), resId, duration)
                toast?.show()
            }
        }

        @JvmStatic
        fun showToast(msg: CharSequence?, @Duration duration: Int) {
            clearToast()
            app?.let {
                toast = Toast.makeText(it.get(), msg, duration)
                toast?.show()
            }
        }

        /**
         * Clear an existing CusToast.
         */
        @JvmStatic
        private fun clearToast() {
            toast?.cancel()
            toast = null
        }
    }
}