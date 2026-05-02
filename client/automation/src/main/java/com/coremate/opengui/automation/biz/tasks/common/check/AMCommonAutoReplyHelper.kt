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

    ///Index of monitored app
    @Volatile
    private var appIndex = 0

    @Volatile
    var curApp = apps.first()

    private val appCount = apps.size

    //Whether replying
    @Volatile
    private var setReplying = false

    //Get task status
    val isReplying: Boolean
        get() = setReplying

    /**
 * Set whether currently replying
     */
    fun setReplying(replying: Boolean) {
        synchronized(this) {
            setReplying = replying
        }
    }

    //Mark complete
    var isHasFinish = false

    //Interval in minutes
    private var cutDownTime = 0

    ///Timed monitor
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
        // Start monitoring
        startTimer()
        //Start execution
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

    ///Start timer
    private fun startTimer() {
        if (mCheckTimer == null) {
            mCheckTimer = Timer()
            mCheckTimerTask = BroadcastTimerTask()
            val oneMinuteMillis = 60 * 1000L
            mCheckTimer?.schedule(mCheckTimerTask, mCheckDelayTime, oneMinuteMillis)
        }
    }

    ///Cancel timer
    private fun cancelTimer() {
        mCheckTimer?.cancel()
        mCheckTimer = null
        mCheckTimerTask?.cancel()
        mCheckTimerTask = null
    }


    //Countdown
    private inner class BroadcastTimerTask : TimerTask() {
        override fun run() {
            if (isTaskPauseOrStop()) return
            if (isCurrentTimeAfter(param?.endTime ?: "")) {
                AMLog.onEDebugLog("结束监测")
                //Ended
                cancelTimer()
                //Stop it
                wxHelper.onTemporarySuspension()
                tkHelper.onTemporarySuspension()
                redHelper.onTemporarySuspension()
                //Mark complete
                isHasFinish = true
                if (!isReplying) {
                    //Complete
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
                        //Continue countdown while replying
                        cutDownTime++
                    } else {
                        //Stop it
                        wxHelper.onTemporarySuspension()
                        tkHelper.onTemporarySuspension()
                        redHelper.onTemporarySuspension()
                        //Continue to the next app
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

    //Whether past the end time
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