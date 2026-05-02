package com.coremate.opengui.automation.base

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import com.coremate.opengui.automation.AMServiceManager
import com.coremate.opengui.automation.base.component.manager.AMCompManager
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.context.IAMProcessListener
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskErrorReason
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMTaskState
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.biz.tasks.tk.bean.AMTkPublishParam
import com.coremate.opengui.automation.biz.type.AMTaskBizType
import com.coremate.opengui.common.statistics.StatisticCustomError
import com.coremate.opengui.common.statistics.StatisticsManager
import java.util.concurrent.ThreadFactory
import kotlin.reflect.KClass

internal class AMCore : IAMProcessListener {

    companion object {
        //Activity before navigating to the permission page
        @JvmStatic
        @SuppressLint("StaticFieldLeak")
        var activityByOp: Activity? = null

        val instance by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            AMCore()
        }
    }

    var context: Activity? = null
    var amContext: AMContext? = null

    private val listeners = mutableListOf<IAMProcessListener>()

    private val mainHandler = Handler(Looper.getMainLooper())

    ///Pending tasks; currently only auto-reply tasks are stored
    var waitTasks = mutableListOf<AMDataContainer>()

    /**
 * Add task listener
     * */
    fun addObserver(listener: IAMProcessListener) {
        synchronized(this) {
            listeners.add(listener)
        }
    }

    /**
 * Remove task listener
     * */
    fun removeObserver(listener: IAMProcessListener) {
        synchronized(this) {
            listeners.remove(listener)
        }
    }

    /**
 * Remove all listeners
     * */
    fun removeAllObserver() {
        synchronized(this) {
            listeners.clear()
        }
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Core scheduler
    //
    /////////////////////////////////////////////////////////////////////////////////

    ///Consume
    fun consume() {
        if (amContext?.taskManager?.isStartTool == true) {
            return
        }
        if (waitTasks.isNotEmpty()) {
            val param = waitTasks.first()
            waitTasks.removeAt(0)
            ///Pre-consume operation
            when (param.bizType) {
                AMTaskBizType.TK_PUBLISH_VIDEO_MIX -> {
                    val clipboard =
                        context?.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    val param = param.bean as AMTkPublishParam?

                    var content =
                        "${param?.videoText}\n"
                    if (param?.isUseUserBg == true) {
                        param.targetCustomerGroup?.let {
                            content = "我的目标客户:${it}\n" + content
                        }
                        param.productFeatures?.let {
                            content = "我销售的产品特点:${it}\n" + content
                        }
                        param.industry?.let {
                            content = "我销售的产品:${it}\n" + content
                        }
                        param.industry?.let {
                            content = "我的行业是:${it}\n" + content
                        }
                    }
                    content += "视频时长限制在:${param?.videoLength}秒"
                    val clip = ClipData.newPlainText(
                        "label",
                        content
                    )
                    clipboard.setPrimaryClip(clip)
                }

                else -> {

                }
            }
            context?.let {
                executes(
                    it,
                    param.bizType!!.targetApp,
                    param.bizType!!.taskCls,
                    ATThreadFactory(),
                    param
                )
            }

        }

    }

    /**
 * Start scheduling
     * */
    @JvmOverloads
    fun executes(
        context: Activity,
        targetApps: List<AMTargetApp>,
        taskCls: KClass<*>,
        threadFactory: ThreadFactory,
        data: AMDataContainer? = null,
    ) {
        //Release first to clear any leftover task state
        destroyAll()
        //Set up context execution operations
        amContext = AMContext(
            activity = context,
            targetApps = targetApps,
            threadFactory = threadFactory,
        ).apply {
            componentManager = AMCompManager(this)
        }.apply {
            processListener = this@AMCore
        }.apply {
            taskManager.isStartTool = true
        }
        //Check whether inside the app
        if (AMContext.isInTargetApp) {
            Handler(Looper.getMainLooper()).post {
                targetApps.first().openThirdApp()
                //Execute task
                AMLog.onEDebugLog("开始执行任务")
                amContext?.taskManager?.onExecute(taskCls, data)
            }
        } else {
            targetApps.first().openThirdApp()
            Handler(Looper.getMainLooper()).postDelayed({
                //Force execution inside the target app
                AMContext.isInTargetApp = true
                //Execute task
                AMLog.onEDebugLog("进入目标app后,开始执行任务")
                amContext?.taskManager?.onExecute(taskCls, data)
            }, 850)
        }
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Service check
    //
    /////////////////////////////////////////////////////////////////////////////////

    /**
 * Helper monitoring
     * */
    fun onAccessibilityEvent(event: AccessibilityEvent) {
        //Filter the current app package name
        val packageName = AMServiceManager.applicationContext.packageName ?: ""
        if (event.packageName == packageName) {
            AMContext.isInTargetApp = false
            return
        }
        //Start check execution
        amContext?.checkTargetAndDispatchTaskManager(event)
    }

    /**
 * Service interruption
     * */
    fun onAccessibilityInterrupt() {
        if (amContext?.taskManager?.taskState == AMTaskState.STOP) {
            AMLog.onEDebugLog(
                "无障碍服务中断，但是任务已经结束",
            )
        } else {
            //Print records
            AMLog.onEDebugLog(
                "无障碍服务中断",
            )
        }

        onProcessTaskFinish(false, 0, AMTaskException.interrupt())

    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Overall process status callback IAM Process Listener
    //
    /////////////////////////////////////////////////////////////////////////////////

    /**
 * Task started
     * */
    override fun onProcessTaskStart() {
        amContext?.taskManager?.setTaskResume = true
        amContext?.taskManager?.setTaskState(AMTaskState.START)
        mainHandler.post {
            listeners.forEach {
                it.onProcessTaskStart()
            }
        }
    }

    /**
 * Task paused
     * */
    override fun onProcessTaskPause(isActive: Boolean) {
        amContext?.taskManager?.setTaskState(AMTaskState.PAUSE)
        mainHandler.post {
            listeners.forEach {
                it.onProcessTaskPause(isActive)
            }
        }
    }

    /**
 * Task resumed
     * */
    override fun onProcessTaskResume() {
        amContext?.taskManager?.setTaskState(AMTaskState.RESUME)
        mainHandler.post {
            listeners.forEach {
                it.onProcessTaskResume()
            }
        }
    }

    /**
 * Task completed successfully
 * @param is Success whether execution succeeded
 * @param elapsed Time elapsed time
 * @param data data after completion
 * @param exception exception
     * */
    override fun onProcessTaskFinish(
        isSuccess: Boolean,
        elapsedTime: Long,
        exception: AMTaskException?,
        sucData: AMDataContainer?
    ) {
        synchronized(this) {
            AMLog.onEDebugLog("onProcessTaskFinish")
            //Task ended; after completion, no need to throw a stop exception
            amContext?.taskManager?.setTaskState(AMTaskState.STOP)
            mainHandler.post {
                //Close core functionality
                amContext?.taskManager?.isStartTool = false
                //Release task resources
                amContext?.destroyCompsAndTask()
                listeners.forEach {
                    it.onProcessTaskFinish(isSuccess, elapsedTime, exception, sucData)
                }


            }
        }
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Release all resources
    //
    /////////////////////////////////////////////////////////////////////////////////

    private fun destroyAll() {
        if (amContext != null) {
            amContext?.destroyAll()
            amContext = null
        }
    }

    //Exception listener
    private inner class ATThreadFactory :
        ThreadFactory {
        override fun newThread(r: Runnable?): Thread {
            val t = Thread(r)
            t.setUncaughtExceptionHandler { _, e ->
                synchronized(this) {
                    if (e is AMTaskException) {
                        when (e.reason) {
                            AMTaskErrorReason.PAUSE -> {
                                //... Pause is not handled
                            }

                            AMTaskErrorReason.STOP -> {
                                AMCore.instance.amContext?.processListener?.onProcessTaskFinish(
                                    false,
                                    0,
                                    e
                                )
                            }

                            AMTaskErrorReason.BUSINESS -> {
                                AMCore.instance.amContext?.processListener?.onProcessTaskFinish(
                                    false,
                                    0,
                                    e
                                )
                                StatisticsManager.instance.onUploadException(
                                    StatisticCustomError.AM_ERR,
                                    e.message ?: "业务异常"
                                )
                            }

                            else -> {}
                        }
                    } else {
                        e.printStackTrace()
                        //crash
                        AMCore.instance.amContext?.processListener?.onProcessTaskFinish(
                            false,
                            0,
                            AMTaskException.crash(cause = e)
                        )
                        StatisticsManager.instance.onUploadException(
                            StatisticCustomError.AM_ERR,
                            e.message ?: "崩溃异常"
                        )
                    }
                }
            }
            return t
        }
    }
}