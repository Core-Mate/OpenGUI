package com.coremate.opengui.automation.base.utils

import android.app.Activity
import android.content.Intent
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.AMServiceManager
import java.lang.reflect.ParameterizedType

object AMUtils {

    /**
     * 跳转到app内对应的页面
     * */
    fun jumpToPageInApp(
        accessibilityService: SelectToSpeakService?,
        activity: Activity?
    ) {
        val intent = Intent()
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val packageName = AMServiceManager.applicationContext.packageName ?: ""
        if (activity != null) {
            intent.setClassName(
                packageName,
                activity.javaClass.name
            )
        } else {
            intent.setClassName(packageName, "${packageName}.MainActivity")
        }
        accessibilityService?.startActivity(intent)
    }

    /**
     * 获取类中的泛型，并实例化
     * */
    @JvmStatic
    fun getT(o: Any, i: Int): Any? {
        try {
            return ((o.javaClass
                .genericSuperclass as ParameterizedType).actualTypeArguments[i] as Class<*>)
                .newInstance()
        } catch (e: InstantiationException) {
            e.printStackTrace()
        } catch (e: IllegalAccessException) {
            e.printStackTrace()
        } catch (e: ClassCastException) {
            e.printStackTrace()
        }
        return null
    }

}