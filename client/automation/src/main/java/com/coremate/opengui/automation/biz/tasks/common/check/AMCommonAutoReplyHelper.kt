package com.coremate.opengui.automation.biz.tasks.common.check

import android.os.Handler
import android.os.Looper
import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.biz.tasks.common.check.bean.AMCommonAutoReplyParam
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.AMRedAutoReplyHelper
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps.*
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.AMTkAutoReplyHelper
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps.*
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.AMWxAutoReplyHelper
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.Timer
import java.util.TimerTask

internal class AMCommonAutoReplyHelper : AMBaseStepHelper() {


    var param: AMCommonAutoReplyParam? = null
    private var wxHelper = AMWxAutoReplyHelper()
    private var tkHelper = AMTkAutoReplyHelper()
    private var redHelper = AMRedAutoReplyHelper()

    val apps = mutableListOf(
        AMTargetApp.WX,
        AMTargetApp.TK,
        AMTargetApp.RED,
    );

    ///监控app的索引
    @Volatile
    private var appIndex = 0

    @Volatile
    var curApp = apps.first()

    private val appCount = apps.size

    //是否在回复中
    @Volatile
    private var setReplying = false

    //获取任务状态
    val isReplying: Boolean
        get() = setReplying

    /**
     * 设置是否是正在回复中的状态
     */
    fun setReplying(replying: Boolean) {
        synchronized(this) {
            setReplying = replying
        }
    }

    //标记完成
    var isHasFinish = false

    //间隔时间（分钟）
    private var cutDownTime = 0

    ///计时监测
    private val mCheckDelayTime: Long = 1000 * 60
    private var mCheckTimer: Timer? = null
    private var mCheckTimerTask: BroadcastTimerTask? = null


    fun initSub() {
        cutDownTime = param?.interval ?: 10

        wxHelper.bindCommon(this)
        wxHelper.registerSteps(
            AMWxAutoReplyStep1::class,
            AMWxAutoReplyStep2::class,
            AMWxAutoReplyStep3::class,
            AMWxAutoReplyStep4::class,
            AMWxAutoReplyStep5::class,
            AMWxAutoReplyStep6::class,
            AMWxAutoReplyStep7::class,
        )

        redHelper.bindCommon(this)
        redHelper.registerSteps(
            AMRedAutoReplyStep1::class,
            AMRedAutoReplyStep2::class,
            AMRedAutoReplyStep3::class,
            AMRedAutoReplyStep4::class,
            AMRedAutoReplyStep5::class,
            AMRedAutoReplyStep6::class,
            AMRedAutoReplyStep7::class,
        )

        tkHelper.bindCommon(this)
        tkHelper.registerSteps(
            AMTkAutoReplyStep1::class,
            AMTkAutoReplyStep2::class,
            AMTkAutoReplyStep3::class,
            AMTkAutoReplyStep4::class,
            AMTkAutoReplyStep5::class,
            AMTkAutoReplyStep6::class,
            AMTkAutoReplyStep7::class,
        )
        startTime = System.currentTimeMillis()
        // 开启监测
        startTimer()
        //开始执行
        continueApp()
    }

    override fun onObserveTaskResume() {
        when (curApp) {
            AMTargetApp.WX -> {
                wxHelper.onObserveTaskResume()
            }

            AMTargetApp.TK -> {
                tkHelper.onObserveTaskResume()
            }

            AMTargetApp.RED -> {
                redHelper.onObserveTaskResume()
            }

            else -> {

            }
        }
    }

    ///开始计时
    private fun startTimer() {
        if (mCheckTimer == null) {
            mCheckTimer = Timer()
            mCheckTimerTask = BroadcastTimerTask()
            val oneMinuteMillis = 60 * 1000L
            mCheckTimer?.schedule(mCheckTimerTask, mCheckDelayTime, oneMinuteMillis)
        }
    }

    ///取消计时
    private fun cancelTimer() {
        mCheckTimer?.cancel()
        mCheckTimer = null
        mCheckTimerTask?.cancel()
        mCheckTimerTask = null
    }


    //倒计时
    private inner class BroadcastTimerTask : TimerTask() {
        override fun run() {
            if (isTaskPauseOrStop()) return
            if (isCurrentTimeAfter(param?.endTime ?: "")) {
                AMLog.onEDebugLog("结束监测")
                //结束了
                cancelTimer()
                //停止掉
                wxHelper.onTemporarySuspension()
                tkHelper.onTemporarySuspension()
                redHelper.onTemporarySuspension()
                //标记完成
                isHasFinish = true
                if (!isReplying) {
                    //完成
                    amContext.processListener?.onProcessTaskFinish(
                        true,
                        System.currentTimeMillis() - startTime,
                    )
                }
            } else {
                AMLog.onEDebugLog("监测计时 ====== $cutDownTime")
                cutDownTime--
                if (cutDownTime <= 0) {
                    if (isReplying) {
                        //正在回复的时候，继续倒计时
                        cutDownTime++
                    } else {
                        //停止掉
                        wxHelper.onTemporarySuspension()
                        tkHelper.onTemporarySuspension()
                        redHelper.onTemporarySuspension()
                        //继续下一个app
                        cutDownTime = param?.interval ?: 10
                        appIndex = (appIndex + 1) % appCount
                        curApp = apps[appIndex]
                        continueApp()
                    }
                }
            }
        }
    }

    private fun continueApp() {
        when (curApp) {
            AMTargetApp.WX -> {
                AMLog.onEDebugLog("切换到微信")
                AMTargetApp.WX.openThirdApp()
                Handler(Looper.getMainLooper()).postDelayed({
                    wxHelper.onContinue()
                }, 850)

            }

            AMTargetApp.TK -> {
                AMLog.onEDebugLog("切换到抖音")
                AMTargetApp.TK.openThirdApp()
                Handler(Looper.getMainLooper()).postDelayed({
                    tkHelper.onContinue()
                }, 850)
            }

            AMTargetApp.RED -> {
                AMLog.onEDebugLog("切换到小红书")
                AMTargetApp.RED.openThirdApp()
                Handler(Looper.getMainLooper()).postDelayed({
                    redHelper.onContinue()
                }, 850)

            }

            else -> {}
        }
    }

    //是否超过结束时间
    private fun isCurrentTimeAfter(endTimeStr: String): Boolean {
        return try {
            val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
            val endTime = sdf.parse(endTimeStr)
            val currentTime = Date()
            endTime != null && currentTime.after(endTime)
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cancelTimer()
        wxHelper.onDestroy()
        redHelper.onDestroy()
        tkHelper.onDestroy()
    }
}