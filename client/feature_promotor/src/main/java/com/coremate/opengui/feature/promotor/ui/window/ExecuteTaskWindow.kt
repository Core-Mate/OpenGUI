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
                // Running -> pause task
                HapticFeedbackHelper.click(context)
                currentTaskState = TaskState.PAUSING
                binding.tvPauseResume.text = "Resume"
                binding.tvContent.text = "Task paused. Tap Resume to continue."
                binding.tvStatus.text = "Paused"
                MessageController.pauseTask()
                Toast.makeText(context.applicationContext, "Task paused", Toast.LENGTH_SHORT).show()
                LogManager.saveLog(
                    context,
                    TAG,
                    "$TAG | user action | tapped Take over, task paused",
                    TaskCenter.executionId ?: -1
                )
                AIFloatWindowManager.getSlideExpandWindow()?.updateContent("Task paused. Tap to resume.")
                AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(true)
            } else {
                // Paused -> resume task
                HapticFeedbackHelper.click(context)
                currentTaskState = TaskState.PLAYING
                binding.tvPauseResume.text = "Take over"
                binding.tvContent.text = "Task running"
                binding.tvStatus.text = "Task running"
                MessageController.resumeTask(null)
                Toast.makeText(context.applicationContext, "Task resumed", Toast.LENGTH_SHORT).show()
                LogManager.saveLog(
                    context,
                    TAG,
                    "$TAG | user action | tapped Resume, task running",
                    TaskCenter.executionId ?: -1
                )
                AIFloatWindowManager.getSlideExpandWindow()?.updateContent("Task running")
                AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(false)
            }
            dismiss("take-over/resume button tapped")
            AIFloatWindowManager.showSlideExpandWindow(
                currentTaskState == TaskState.PLAYING,
                "take over/resume"
            )
        }
        binding.cardStop.setOnClickListener {
            // Stop task: cancel auto-hide and show confirm/cancel buttons.
            HapticFeedbackHelper.lightTap(context)
            handler.removeCallbacks(shrinkRunnable)
            binding.cardPauseResume.visibility = GONE
            binding.cardStop.visibility = GONE
            binding.confirmCancelContainer.visibility = VISIBLE
            MessageController.pauseTask()
            binding.tvContent.text = "Stop the current task?"
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(true)
            LogManager.saveLog(
                context, TAG, "$TAG | user action | tapped stop",
                TaskCenter.executionId ?: -1
            )
        }
        binding.cardConfirm.setOnClickListener {
            // Confirm: stop the task.
            HapticFeedbackHelper.confirm(context)
            LogManager.saveLog(
                context, TAG, "$TAG | user action | confirmed stop",
                TaskCenter.executionId ?: -1
            )
            AIFloatWindowManager.dismissAllWindow()
            Toast.makeText(context.applicationContext, "Task stopped", Toast.LENGTH_SHORT).show()
            MessageController.cancelAndGotoSummarizer()
        }
        binding.cardCancel.setOnClickListener {
            // Cancel: restore controls and hide the window.
            HapticFeedbackHelper.click(context)
            MessageController.resumeTask(null)
            binding.confirmCancelContainer.visibility = GONE
            binding.cardPauseResume.visibility = VISIBLE
            binding.cardStop.visibility = VISIBLE
            // Dismiss directly after cancel.
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("Task running")
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(false)
            AIFloatWindowManager.showSlideExpandWindow(
                currentTaskState == TaskState.PLAYING,
                "take over/resume"
            )
            dismiss("cancel button tapped")
            LogManager.saveLog(
                context, TAG, "$TAG | user action | cancelled stop",
                TaskCenter.executionId ?: -1
            )
        }
        binding.cardSupplement.setOnClickListener {
            HapticFeedbackHelper.click(context)
            handler.removeCallbacks(shrinkRunnable)
            currentTaskState = TaskState.PAUSING
            binding.tvPauseResume.text = "Resume"
            binding.tvContent.text = "Task paused. Tap Resume to continue."
            binding.tvStatus.text = "Paused"
            MessageController.pauseTask()
            Toast.makeText(context.applicationContext, "Task paused", Toast.LENGTH_SHORT).show()
            LogManager.saveLog(
                context,
                TAG, "$TAG | user action | tapped add information, task paused",
                TaskCenter.executionId ?: -1
            )
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("Task paused. Tap to resume.")
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(true)
            binding.controlContainer.visibility = GONE
            binding.supplementContainer.visibility = VISIBLE
            binding.etSupplement.text = null

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
            binding.tvPauseResume.text = "Take over"
            binding.tvContent.text = "Task running"
            binding.tvStatus.text = "Task running"
            MessageController.resumeTask(null)
            Toast.makeText(context.applicationContext, "Task resumed", Toast.LENGTH_SHORT).show()
            LogManager.saveLog(
                context,
                TAG, "$TAG | user action | cancelled additional information, task resumed",
                TaskCenter.executionId ?: -1
            )
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("Task running")
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(false)
            AIFloatWindowManager.showSlideExpandWindow(
                currentTaskState == TaskState.PLAYING,
                "cancel additional information"
            )
            binding.controlContainer.visibility = VISIBLE
            binding.supplementContainer.visibility = GONE
            setWindowFocusable(false)
            startShrinkTimeDown("cancel additional information")
        }
        binding.cardSubmitSupplement.setOnClickListener {
            HapticFeedbackHelper.click(context)
            currentTaskState = TaskState.PLAYING
            binding.tvPauseResume.text = "Take over"
            binding.tvContent.text = "Task running"
            binding.tvStatus.text = "Task running"
            MessageController.resumeTask(binding.etSupplement.text.toString())
            Toast.makeText(context.applicationContext, "Task resumed", Toast.LENGTH_SHORT).show()
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | user action | submitted additional information, task resumed, content: ${binding.etSupplement.text.toString()}",
                TaskCenter.executionId ?: -1
            )
            AIFloatWindowManager.getSlideExpandWindow()?.updateContent("Task running")
            AIFloatWindowManager.showSlideExpandWindow(
                currentTaskState == TaskState.PLAYING,
                "submit additional information"
            )
            AIFloatWindowManager.getSlideExpandWindow()?.updateBackground(false)
            binding.controlContainer.visibility = VISIBLE
            binding.supplementContainer.visibility = GONE
            setWindowFocusable(false)
            dismiss("submit additional information")
        }
    }

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
            context, TAG, "$TAG | start cycling preset status text",
            TaskCenter.executionId ?: -1
        )
        try {
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | fake operation window shown | isAttachedToWindow = $isShowing  | currentTaskState = ${TaskCenter.currentTaskState}," +
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
        "Getting current screen focus",
        "Checking UI element layout",
        "Analyzing task intent relevance",
        "Calculating best interaction path",
        "Checking system access permissions",
        "Optimizing network request payload",
        "Filtering irrelevant page noise",
        "Generating action sequence",
        "Checking instruction logic",
        "Preparing next action phase"
    )

    private val loopFakeOperationRunnable = object : Runnable {
        override fun run() {
            val string = fakeOperations[getRandomSingleDigit()]
            val time = getRandomTime()
            Log.d(TAG, "ExecuteTaskWindow     $string     ${time.toLong()}")
            // Update the visible status text.
            binding.tvStatus.text = "Running"
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
            context, TAG, "$TAG | start shrink countdown | from=$from",
            TaskCenter.executionId ?: -1
        )
        handler.removeCallbacks(shrinkRunnable)
        handler.postDelayed(shrinkRunnable, 3000)
    }

    private var shrinkRunnable = Runnable {
        LogManager.saveLog(
            context, TAG, "$TAG | shrinkRunnable | hide execution window",
            TaskCenter.executionId ?: -1
        )
        dismiss("timer triggered hide")
        AIFloatWindowManager.showSlideExpandWindow(
            currentTaskState == TaskState.PLAYING,
            "execution status bar, timer"
        )
    }

    @Synchronized
    fun show(from: String) {
        try {
            LogManager.saveLog(
                context,
                TAG,
                "$TAG | execution window show | from = $from | isShowing = $isShowing  | currentTaskState = ${TaskCenter.currentTaskState}," +
                        "${TaskCenter.executionId ?: -1}",
                TaskCenter.executionId ?: -1
            )
            if (!isShowing && TaskCenter.currentTaskState == TaskCenter.TaskState.EXECUTE) {
                reset("$from - show")
                AIFloatWindowManager.getSlideExpandWindow()?.dismiss("execution window shown, hide slide window")
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
                "$TAG | execution window hide | from = $from | isShowing = $isShowing",
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
        binding.tvPauseResume.text = "Resume"
        binding.tvContent.text = "Task paused. Tap Resume to continue."
        binding.tvStatus.text = "Paused"
        startShrinkTimeDown("setPauseTaskStatus")
        Toast.makeText(context, "Task paused", Toast.LENGTH_SHORT).show()
        LogManager.saveLog(
            context, "ExecuteTaskWindow", "Received user takeover action",
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
                binding.tvPauseResume.text = "Take over"
            }

            TaskState.PAUSING -> {
                binding.tvPauseResume.text = "Resume"
                binding.tvStatus.text = "Paused"
                binding.tvContent.text = "Task paused. Tap Resume to continue."
            }
        }
        // Restore the default controls and hide the confirmation controls.
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
