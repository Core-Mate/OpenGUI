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
        //跳转到权限页面之前的activity
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

    ///待执行的（目前只存自动回复的任务）
    var waitTasks = mutableListOf<AMDataContainer>()

    /**
     * 添加任务监听
     * */
    fun addObserver(listener: IAMProcessListener) {
        synchronized(this) {
            listeners.add(listener)
        }
    }

    /**
     * 移除任务监听
     * */
    fun removeObserver(listener: IAMProcessListener) {
        synchronized(this) {
            listeners.remove(listener)
        }
    }

    /**
     * 移除所有监听
     * */
    fun removeAllObserver() {
        synchronized(this) {
            listeners.clear()
        }
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                      核心调度
    //
    /////////////////////////////////////////////////////////////////////////////////

    ///消费
    fun consume() {
        if (amContext?.taskManager?.isStartTool == true) {
            return
        }
        if (waitTasks.isNotEmpty()) {
            val param = waitTasks.first()
            waitTasks.removeAt(0)
            ///前置consume()操作
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
     * 开始调度
     * */
    @JvmOverloads
    fun executes(
        context: Activity,
        targetApps: List<AMTargetApp>,
        taskCls: KClass<*>,
        threadFactory: ThreadFactory,
        data: AMDataContainer? = null,
    ) {
        //先释放，防止之前的任务相关还存在
        destroyAll()
        //设置上下文执行操作
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
        //判断是否在app内
        if (AMContext.isInTargetApp) {
            Handler(Looper.getMainLooper()).post {
                targetApps.first().openThirdApp()
                //执行任务
                AMLog.onEDebugLog("开始执行任务")
                amContext?.taskManager?.onExecute(taskCls, data)
            }
        } else {
            targetApps.first().openThirdApp()
            Handler(Looper.getMainLooper()).postDelayed({
                //强制在目标app内
                AMContext.isInTargetApp = true
                //执行任务
                AMLog.onEDebugLog("进入目标app后,开始执行任务")
                amContext?.taskManager?.onExecute(taskCls, data)
            }, 850)
        }
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                      服务检测
    //
    /////////////////////////////////////////////////////////////////////////////////

    /**
     * 辅助监测
     * */
    fun onAccessibilityEvent(event: AccessibilityEvent) {
        //过滤当前app的包名
        val packageName = AMServiceManager.applicationContext.packageName ?: ""
        if (event.packageName == packageName) {
            AMContext.isInTargetApp = false
            return
        }
        //开始检测执行
        amContext?.checkTargetAndDispatchTaskManager(event)
    }

    /**
     * 服务中断
     * */
    fun onAccessibilityInterrupt() {
        if (amContext?.taskManager?.taskState == AMTaskState.STOP) {
            AMLog.onEDebugLog(
                "无障碍服务中断，但是任务已经结束",
            )
        } else {
            //打印记录
            AMLog.onEDebugLog(
                "无障碍服务中断",
            )
        }

        onProcessTaskFinish(false, 0, AMTaskException.interrupt())

    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                      整体流程状态回调 IAMProcessListener
    //
    /////////////////////////////////////////////////////////////////////////////////

    /**
     * 任务开始
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
     * 任务暂停
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
     * 任务恢复
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
     * 任务成功完成
     * @param isSuccess 是否成功
     * @param elapsedTime 耗时
     * @param data 完成后的数据
     * @param exception 异常
     * */
    override fun onProcessTaskFinish(
        isSuccess: Boolean,
        elapsedTime: Long,
        exception: AMTaskException?,
        sucData: AMDataContainer?
    ) {
        synchronized(this) {
            AMLog.onEDebugLog("onProcessTaskFinish")
            //任务结束 (完成之后，不用在抛出停止异常)
            amContext?.taskManager?.setTaskState(AMTaskState.STOP)
            mainHandler.post {
                //关闭核心功能
                amContext?.taskManager?.isStartTool = false
                //任务释放
                amContext?.destroyCompsAndTask()
                listeners.forEach {
                    it.onProcessTaskFinish(isSuccess, elapsedTime, exception, sucData)
                }


            }
        }
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                      释放所有
    //
    /////////////////////////////////////////////////////////////////////////////////

    private fun destroyAll() {
        if (amContext != null) {
            amContext?.destroyAll()
            amContext = null
        }
    }

    //异常监听
    private inner class ATThreadFactory :
        ThreadFactory {
        override fun newThread(r: Runnable?): Thread {
            val t = Thread(r)
            t.setUncaughtExceptionHandler { _, e ->
                synchronized(this) {
                    if (e is AMTaskException) {
                        when (e.reason) {
                            AMTaskErrorReason.PAUSE -> {
                                //... 暂停不处理
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