package com.coremate.opengui.feature.promotor.ui.window

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.util.Log
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.WindowManager
import android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import android.widget.RelativeLayout
import android.widget.Toast
import androidx.lifecycle.LifecycleOwner
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.feature.promotor.common.MessageController
import com.coremate.opengui.common.utils.HapticFeedbackHelper
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.databinding.WindowExecuteTask2Binding
import com.coremate.opengui.feature.promotor.ui.AIFloatWindowManager

enum class TaskState {
    PLAYING, PAUSING
}

class ExecuteTaskWindow(context: Context) : FrameLayout(context) {
    private val TAG = "ExecuteTaskWindow"
    private val binding: WindowExecuteTask2Binding
    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val handler = Handler(Looper.getMainLooper())
    private var attachedLifecycleOwner: LifecycleOwner? = null
    private val rootLayout: RelativeLayout
    private var currentTaskState = TaskState.PLAYING
    @Volatile
    var isShowing = false

    init {
        AIFloatWindowManager.registerExecuteTaskWindow(this)
        val themedContext =
            ContextThemeWrapper(context, R.style.Theme_Promotor_Feature)
        binding =
            WindowExecuteTask2Binding.inflate(
                LayoutInflater.from(themedContext),
                this,
                true
            )
        rootLayout = binding.root
        initEvent()
    }

    fun initEvent() {
        binding.cardPauseResume.setOnClickListener {
            if (currentTaskState == TaskState.PLAYING) {
                // 执行中 -> 暂停任务
                HapticFeedbackHelper.click(context)
                currentTaskState = TaskState.PAUSING
                binding.tvPauseResume.text = "恢复执行"
                binding.tvContent.text = "任务已暂停，点击继续按钮恢复任务"
                binding.tvStatus.text = "暂停中"
                MessageController.pauseTask()
                Toast.makeText(context.applicationContext, "任务已暂停", Toast.LENGTH_SHORT).show()
                LogManager.saveLog(
                    context,
                    TAG,
                    "$TAG | 用户操作 | 点击人工接管 任务暂停",
                    TaskCenter.executionId ?: -1
                )
                AIFloatWindowManager.getSlideExpandWindow()?.updateContent("任务已暂停，点击恢复")
                AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(true)
            } else {
                // 暂停中 -> 恢复任务
                HapticFeedbackHelper.click(context)
                currentTaskState = TaskState.PLAYING
                binding.tvPauseResume.text = "人工接管"
                binding.tvContent.text = "任务执行中"
                binding.tvStatus.text = "任务执行中"
                MessageController.resumeTask(null)
                Toast.makeText(context.applicationContext, "任务已恢复", Toast.LENGTH_SHORT).show()
                LogManager.saveLog(
                    context,
                    TAG,
                    "$TAG | 用户操作 | 点击恢复执行 任务执行",
                    TaskCenter.executionId ?: -1
                )
                AIFloatWindowManager.getSlideExpandWindow()?.updateContent("任务执行中")
                AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(false)
            }
            dismiss("点击接管/恢复按钮")
            AIFloatWindowManager.showSlideExpandWindow(
                currentTaskState == TaskState.PLAYING,
                "接管/恢复"
            )
        }
        binding.cardStop.setOnClickListener {
            // 点击结束任务：取消自动隐藏，显示确认和取消按钮
            HapticFeedbackHelper.lightTap(context)
            handler.removeCallbacks(shrinkRunnable) // 取消自动隐藏计时器
            binding.cardPauseResume.visibility = GONE
            binding.cardStop.visibility = GONE
            binding.confirmCancelContainer.visibility = VISIBLE
            MessageController.pauseTask()
            binding.tvContent.text = "是否确认结束当前任务？"
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(true)
            LogManager.saveLog(
                context, TAG, "$TAG | 用户操作 | 点击终止按钮",
                TaskCenter.executionId ?: -1
            )
        }
        binding.cardConfirm.setOnClickListener {
            // 点击确认：真正停止任务
            HapticFeedbackHelper.confirm(context)
            LogManager.saveLog(
                context, TAG, "$TAG | 用户操作 | 确认终止",
                TaskCenter.executionId ?: -1
            )
            AIFloatWindowManager.dismissAllWindow()
            Toast.makeText(context.applicationContext, "任务已停止", Toast.LENGTH_SHORT).show()
            MessageController.cancelAndGotoSummarizer()
        }
        binding.cardCancel.setOnClickListener {
            // 点击取消：恢复自动隐藏，隐藏确认/取消按钮，显示原来的按钮，然后立即隐藏窗口
            HapticFeedbackHelper.click(context)
            MessageController.resumeTask(null)
            binding.confirmCancelContainer.visibility = GONE
            binding.cardPauseResume.visibility = VISIBLE
            binding.cardStop.visibility = VISIBLE
            // 取消后直接 dismiss，无需再恢复计时器
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("任务执行中")
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(false)
            AIFloatWindowManager.showSlideExpandWindow(
                currentTaskState == TaskState.PLAYING,
                "接管/恢复"
            )
            dismiss("点击取消按钮")
            LogManager.saveLog(
                context, TAG, "$TAG | 用户操作 | 取消终止",
                TaskCenter.executionId ?: -1
            )
        }
        binding.cardSupplement.setOnClickListener {
            HapticFeedbackHelper.click(context)
            handler.removeCallbacks(shrinkRunnable) // 取消自动隐藏计时器
            currentTaskState = TaskState.PAUSING
            binding.tvPauseResume.text = "恢复执行"
            binding.tvContent.text = "任务已暂停，点击继续按钮恢复任务"
            binding.tvStatus.text = "暂停中"
            MessageController.pauseTask()
            Toast.makeText(context.applicationContext, "任务已暂停", Toast.LENGTH_SHORT).show()
            LogManager.saveLog(
                context,
                TAG, "$TAG | 用户操作 | 用户点击补充信息按钮，暂停任务",
                TaskCenter.executionId ?: -1
            )
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("任务已暂停，点击恢复")
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(true)
            binding.controlContainer.visibility = GONE
            binding.supplementContainer.visibility = VISIBLE
            binding.etSupplement.text = null
            // 允许窗口获得焦点，以便 EditText 能弹出软键盘
            setWindowFocusable(true)
            binding.etSupplement.post {
                binding.etSupplement.requestFocus()
                (context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)
                    ?.showSoftInput(binding.etSupplement, InputMethodManager.SHOW_IMPLICIT)
            }
        }
        binding.cardCancelSupplement.setOnClickListener {
            HapticFeedbackHelper.click(context)
            currentTaskState = TaskState.PLAYING
            binding.tvPauseResume.text = "人工接管"
            binding.tvContent.text = "任务执行中"
            binding.tvStatus.text = "任务执行中"
            MessageController.resumeTask(null)
            Toast.makeText(context.applicationContext, "任务已恢复", Toast.LENGTH_SHORT).show()
            LogManager.saveLog(
                context,
                TAG, "$TAG | 用户操作 | 取消补充，任务恢复执行",
                TaskCenter.executionId ?: -1
            )
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("任务执行中")
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(false)
            AIFloatWindowManager.showSlideExpandWindow(
                currentTaskState == TaskState.PLAYING,
                "取消信息补充"
            )
            binding.controlContainer.visibility = VISIBLE
            binding.supplementContainer.visibility = GONE
            setWindowFocusable(false)
            startShrinkTimeDown("取消补充信息")
        }
        binding.cardSubmitSupplement.setOnClickListener {
            HapticFeedbackHelper.click(context)
            currentTaskState = TaskState.PLAYING
            binding.tvPauseResume.text = "人工接管"
            binding.tvContent.text = "任务执行中"
            binding.tvStatus.text = "任务执行中"
            MessageController.resumeTask(binding.etSupplement.text.toString())
            Toast.makeText(context.applicationContext, "任务已恢复", Toast.LENGTH_SHORT).show()
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | 用户操作 | 提交补充 ，任务恢复执行，补充内容：${binding.etSupplement.text.toString()}",
                TaskCenter.executionId ?: -1
            )
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("任务执行中")
            AIFloatWindowManager.showSlideExpandWindow(
                currentTaskState == TaskState.PLAYING,
                "提交信息补充"
            )
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(false)
            binding.controlContainer.visibility = VISIBLE
            binding.supplementContainer.visibility = GONE
            setWindowFocusable(false)
            dismiss("提交信息补充")
        }
    }

    /** 切换窗口是否可获焦：补充输入框需要可获焦才能弹出软键盘 */
    private fun setWindowFocusable(focusable: Boolean) {
        val params = layoutParams as? WindowManager.LayoutParams ?: return
        val newFlags = if (focusable) {
            params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
        } else {
            params.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        }
        if (params.flags != newFlags) {
            params.flags = newFlags
            windowManager.updateViewLayout(this, params)
        }
    }

    fun loopFakeOperation() {
        LogManager.saveLog(
            context, TAG, "$TAG | 开始循环播放预置文案",
            TaskCenter.executionId ?: -1
        )
        try {
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | fake operation 执行悬浮窗 显示 | isAttachedToWindow = $isShowing  | currentTaskState = ${TaskCenter.currentTaskState}," +
                        "${TaskCenter.executionId ?: -1}",
                TaskCenter.executionId ?: -1
            )
            if (!isShowing && TaskCenter.currentTaskState == TaskCenter.TaskState.EXECUTE) {
                isShowing = true
                windowManager.addView(this, baseLayoutParams)
                handler.removeCallbacks(loopFakeOperationRunnable)
                handler.postDelayed(loopFakeOperationRunnable, 0)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Log.d(TAG, "show: " + e.printStackTrace() + "   " + e.message)
        }
    }

    private val fakeOperations = arrayOf(
        "正在获取当前屏幕焦点",
        "正在校验 UI 元素布局状态",
        "正在分析任务意图关联性",
        "正在计算最优交互路径方案",
        "正在预检系统安全访问权限",
        "正在优化网络数据请求负载",
        "正在过滤页面冗余干扰信息",
        "正在生成操作执行指令序列",
        "正在校验指令逻辑完整度",
        "正在准备执行下一阶段动作"
    )

    private val loopFakeOperationRunnable = object : Runnable {
        override fun run() {
            val string = fakeOperations[getRandomSingleDigit()]
            val time = getRandomTime()
            Log.d(TAG, "ExecuteTaskWindow     $string     ${time.toLong()}")
            // 1. 执行 UI 更新逻辑
            binding.tvStatus.text = "执行中"
            binding.tvContent.text = string
            handler.postDelayed(this, time.toLong())
        }
    }

    fun getRandomSingleDigit(): Int {
        return (0..9).random()
    }

    fun getRandomTime(): Int {
        return (3000..5000).random()
    }

    fun startShrinkTimeDown(from: String) {
        LogManager.saveLog(
            context, TAG, "$TAG | 开始缩小倒计时 | from=$from",
            TaskCenter.executionId ?: -1
        )
        handler.removeCallbacks(shrinkRunnable)
        handler.postDelayed(shrinkRunnable, 3000)
    }

    private var shrinkRunnable = Runnable {
        LogManager.saveLog(
            context, TAG, "$TAG | shrinkRunnable | 隐藏执行弹窗",
            TaskCenter.executionId ?: -1
        )
        dismiss("定时器触发隐藏")
        AIFloatWindowManager.showSlideExpandWindow(
            currentTaskState == TaskState.PLAYING,
            "执行状态栏，计时器"
        )
    }

    @Synchronized
    fun show(from: String) {
        try {
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | 执行悬浮窗 显示 | from = $from | isShowing = $isShowing  | currentTaskState = ${TaskCenter.currentTaskState}," +
                        "${TaskCenter.executionId ?: -1}",
                TaskCenter.executionId ?: -1
            )
            if (!isShowing && TaskCenter.currentTaskState == TaskCenter.TaskState.EXECUTE) {
                reset("$from - show")
                AIFloatWindowManager.getSlideExpandWindow()?.dismiss("悬浮窗显示，隐藏灵动岛")
                windowManager.addView(this, baseLayoutParams)
                isShowing = true
                startShrinkTimeDown("show")
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Log.d(TAG, "show: " + e.printStackTrace() + "   " + e.message)
        }
    }

    @Synchronized
    fun dismiss(from: String) {
        try {
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | 执行悬浮窗 隐藏 | from = $from | isShowing = $isShowing",
                TaskCenter.executionId ?: -1
            )
            if (isShowing) {
                AIFloatWindowManager.getSlideExpandWindow()?.show(from)
                windowManager.removeView(this)
                isShowing = false
                handler.removeCallbacks(shrinkRunnable)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun setPauseTaskStatus() {
        currentTaskState = TaskState.PAUSING
        binding.tvPauseResume.text = "恢复执行"
        binding.tvContent.text = "任务已暂停，点击继续按钮恢复任务"
        binding.tvStatus.text = "暂停中"
        startShrinkTimeDown("setPauseTaskStatus")
        Toast.makeText(context, "任务已暂停", Toast.LENGTH_SHORT).show()
        LogManager.saveLog(
            context, "ExecuteTaskWindow", "收到了用户接管的 action",
            TaskCenter.executionId ?: -1
        )
    }

    fun setCurrentTaskState(state: TaskState) {
        currentTaskState = state
        reset("setCurrentTaskState     $state")
    }

    fun updateContent(content: String, from: String) {
        try {
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | updateContent | from = $from | content = $content",
                TaskCenter.executionId ?: -1
            )
            handler.removeCallbacks(loopFakeOperationRunnable)
            if (!TextUtils.isEmpty(content)) {
                binding.tvContent.text = content.replace("\n", "")
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun reset(from: String) {
        LogManager.saveLog(
            context,
            TAG,
            "$TAG | finalUpdateView | currentTaskState = $currentTaskState | from = $from",
            TaskCenter.executionId ?: -1
        )
        when (currentTaskState) {
            TaskState.PLAYING -> {
                binding.tvPauseResume.text = "人工接管"
            }

            TaskState.PAUSING -> {
                binding.tvPauseResume.text = "恢复执行"
                binding.tvStatus.text = "暂停中"
                binding.tvContent.text = "任务已暂停，点击继续按钮恢复任务"
            }
        }
        // 确保按钮状态正确：显示原来的按钮，隐藏确认/取消按钮
        binding.cardPauseResume.visibility = VISIBLE
        binding.cardStop.visibility = VISIBLE
        binding.confirmCancelContainer.visibility = GONE
    }

    private val baseLayoutParams: WindowManager.LayoutParams by lazy {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_LAYOUT_INSET_DECOR,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = dp2px(10).toInt()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode =
                    LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
    }

    private fun dp2px(dp: Int): Float {
        return dp * resources.displayMetrics.density
    }
}