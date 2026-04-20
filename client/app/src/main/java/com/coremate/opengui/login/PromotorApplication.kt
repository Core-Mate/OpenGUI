package com.coremate.opengui.login

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.lifecycleScope
import com.coremate.opengui.automation.AMServiceManager
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.accessibility.capture.ScreenCaptureManager
import com.coremate.opengui.common.interfaces.ScreenshotProvider
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common.statistics.StatisticsManager
import com.coremate.opengui.common.utils.AndroidLogger
import com.coremate.opengui.common.utils.HapticFeedbackHelper
import com.coremate.opengui.common.utils.TimeUtils
import com.coremate.opengui.common.utils.TimeUtils.toBeijingUtcString
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.common_jvm.utils.Logger
import com.coremate.opengui.feature.promotor.common.MessageController
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.common.markdown.MarkwonManager
import com.coremate.opengui.common.push.PushManager
import com.coremate.opengui.feature.promotor.sdk.SpeechEngineManager
import com.coremate.opengui.feature.promotor.ui.AIFloatWindowManager
import com.coremate.opengui.network.api.ServerConstant
import com.tencent.mmkv.MMKV
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch


class PromotorApplication : Application(), LifecycleOwner, ViewModelStoreOwner {

    private val TAG = "PromotorApplication"
    private val runtimeLogger: Logger = AndroidLogger()
    private lateinit var lifecycleRegistry: LifecycleRegistry
    override val lifecycle: Lifecycle
        get() = lifecycleRegistry

    private lateinit var _viewModelStore: ViewModelStore
    override val viewModelStore: ViewModelStore
        get() = _viewModelStore

    override fun onCreate() {
        super.onCreate()
        PushManager.applicationContext = applicationContext
        SpeechEngineManager.initialize(this, this)
        //预初始化统计sdk
        StatisticsManager.instance.preInitSDK(this)
        // Initialize LifecycleRegistry
        lifecycleRegistry = LifecycleRegistry(this)
        lifecycleRegistry.currentState = Lifecycle.State.CREATED
        lifecycleRegistry.currentState = Lifecycle.State.STARTED

        _viewModelStore = ViewModelStore()

        MarkwonManager.getInstance().init(this)

        lifecycleScope.launch {
            AutomationEventBus.events.collectLatest { event ->
                when (event) {
                    is AutomationEvent.CallUser -> {
                        HapticFeedbackHelper.alert(applicationContext)
                        AIFloatWindowManager.hideExecuteTaskWindow("CallUser")
                        AIFloatWindowManager.getSlideExpandWindow()?.dismiss("CallUser")
                        AIFloatWindowManager.showCallUserWindow(event.message)
                    }

                    else -> {}
                }
            }
        }
        //初始化自动化
        AMServiceManager.instance.init(this)
        MessageController.init(this)
        val screenshotProviderInstance: ScreenshotProvider = ScreenCaptureManager() // 创建实例并向上转型为接口

        //注册前台/后台监听
        ProcessLifecycleOwner.get().lifecycle.addObserver(AppLifecycleObserver(this@PromotorApplication))
        //初始化 mmkv
        val rootDir: String = MMKV.initialize(this)

        //初始化统计sdk
        StatisticsManager.instance.initSDK()
        TimeUtils.init(applicationContext)
    }

    fun getTaskCenter(): TaskCenter {
        return TaskCenter
    }

    class AppLifecycleObserver(private var context: Context) : DefaultLifecycleObserver {
        override fun onStart(owner: LifecycleOwner) {
            CoroutineScope(Dispatchers.Main).launch {
                LogManager.saveLog(
                    context,
                    "AppLifecycleObserver",
                    "AppLifecycleObserver | OpenGUI进入前台",
                    TaskCenter.executionId ?: -1
                )
                MessageController.setBackgroundStatus(false)
                AIFloatWindowManager.dismissAllWindow()
                AIFloatWindowManager.hideExecuteTaskWindow("OpenGUI进入前台")
            }
        }

        override fun onStop(owner: LifecycleOwner) {
            Log.d("PromotorApplication", "onStop: ")
            CoroutineScope(Dispatchers.Main).launch {
                val hasActiveExecution = TaskCenter.executionId != null && TaskCenter.executionId!! > 0
                LogManager.saveLog(
                    context,
                    "AppLifecycleObserver",
                    "AppLifecycleObserver | OpenGUI进入后台 | hasActiveExecution = $hasActiveExecution",
                    TaskCenter.executionId ?: -1
                )
                if (hasActiveExecution && !TaskCenter.isSummarizing) {
                    MessageController.setBackgroundStatus(true)
                    AIFloatWindowManager.getExecuteTaskWindow()?.reset("OpenGUI进入后台")
                    AIFloatWindowManager.showExecuteTaskWindow("OpenGUI进入后台")
                    AIFloatWindowManager.showGradientWindow("OpenGUI进入后台")
                }
            }
        }
    }


    /**
     * 检查我们的无障碍服务是否在系统设置中启用。
     */
    private fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val service = "${context.packageName}/${GestureService::class.java.canonicalName}"
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        return enabledServices?.contains(service) == true
    }

    /**
     * 提示用户开启无障碍服务。
     */
    private fun promptEnableAccessibilityService(context: Context) {
        Toast.makeText(context, "【重要】请开启应用的无障碍服务以使用自动化功能", Toast.LENGTH_LONG)
            .show()
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        runtimeLogger.info("PromotorApplication", "Prompted user to enable Accessibility Service.")
    }

    /**
     * 提示用户开启悬浮窗权限。
     */
    private fun promptEnableOverlayPermission(context: Context) {
        Toast.makeText(context, "【重要】请授予悬浮窗权限以显示任务状态和交互", Toast.LENGTH_LONG)
            .show()
        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        runtimeLogger.info("PromotorApplication", "Prompted user to enable Overlay Permission.")
    }

    /**
     * 提示用户将应用加入电池优化白名单。
     */
    private fun promptIgnoreBatteryOptimizations(context: Context) {
        Toast.makeText(
            context,
            "【重要】请关闭电池优化以保持自动化任务后台稳定运行",
            Toast.LENGTH_LONG
        ).show()
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        intent.data = Uri.parse("package:${context.packageName}")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        runtimeLogger.info("PromotorApplication", "Prompted user to ignore battery optimizations.")
    }

    override fun onTerminate() {
        super.onTerminate()
        viewModelStore.clear()
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
        runtimeLogger.info("PromotorApplication", "PromotorApplication terminated.")
    }
}