package com.coremate.opengui.feature.promotor.ui.execute

import android.animation.ObjectAnimator
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.lifecycleScope
import com.coremate.opengui.accessibility.ActionExecutor
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.common.MessageController
import com.coremate.opengui.feature.promotor.common.feedback.ClickFeedbackView
import com.coremate.opengui.feature.promotor.common.markdown.MarkwonManager
import com.coremate.opengui.feature.promotor.databinding.ActivityPromptExecutionBinding
import com.coremate.opengui.feature.promotor.ui.AIFloatWindowManager
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.feature.promotor.viewmodel.FinalStateEnum
import com.coremate.opengui.feature.promotor.viewmodel.UIMessageBean
import com.coremate.opengui.network.api.ServerConstant
import com.coremate.opengui.network.upload.ImageUploaderImpl
import com.tencent.mmkv.MMKV
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch


enum class ExecutionPhase(val index: Int, val title: String, val desc: String, val progress: Float) {
    GENERATING_PLAN(0, "Generating plan", "Generating execution plan...", 25f),
    LOADING_SKILL(1, "Loading skills", "Loading dedicated skills...", 50f),
    PLANNING_PATH(2, "Planning path", "Breaking down execution steps...", 75f),
}

class PromptExecutionActivity :
    BaseBindingActivity<ActivityPromptExecutionBinding>(ActivityPromptExecutionBinding::inflate) {
    private val TAG = "PromptExecutionActivity"
    private var currentPhase: ExecutionPhase? = null
    private var isComplete = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var stopTaskPlanDialog: AlertDialog? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setNavigationBarColor(Color.TRANSPARENT)

        // Event collection - screenshot fail handling
        lifecycleScope.launch {
            AutomationEventBus.events.collectLatest { event ->
                if (event == AutomationEvent.ScreenshotFail) {
                    launch(Dispatchers.Main) {
                        Toast.makeText(
                            this@PromptExecutionActivity,
                            "Screenshot failed. Returning to the home page.",
                            Toast.LENGTH_SHORT
                        ).show()
                        finish()
                    }
                }
            }
        }

    }

    override fun onResume() {
        super.onResume()
    }

    override fun initView() {
        currentPhase = null
        isComplete = false
        binding.circularProgress.progress = 0f
        binding.circularProgress.isComplete = false
        binding.phaseTitleContainer.visibility = View.VISIBLE
        binding.tvCompleteTitle.visibility = View.GONE
        binding.thinkingContainer.visibility = View.VISIBLE
        binding.tvBottomJumping.visibility = View.GONE
        binding.tvCancelPrompt.visibility = View.GONE
        binding.cancelPromptContainer.visibility = View.VISIBLE
        binding.tvPhaseTitle.text = "Preparing"
        binding.tvPhaseDesc.text = "Connecting to service..."
        startCursorBlink()


        lifecycleScope.launch {
            MessageController.sendMessage()
            AIFloatWindowManager.resetExecuteWindow("$TAG initView")
        }
    }

    private fun updatePhase(phase: ExecutionPhase) {
        if (isComplete) return
        val current = currentPhase
        if (current != null && phase.index <= current.index) return
        currentPhase = phase
        binding.tvPhaseTitle.text = phase.title
        binding.tvPhaseDesc.text = phase.desc
        binding.circularProgress.progress = phase.progress
    }

    private fun setCompleteState() {
        if (isComplete) return
        isComplete = true
        binding.circularProgress.onProgressAnimationEnd = {
            binding.circularProgress.isComplete = true
            binding.phaseTitleContainer.visibility = View.GONE
            binding.tvCompleteTitle.visibility = View.VISIBLE
            binding.thinkingContainer.visibility = View.GONE
            binding.tvBottomJumping.visibility = View.VISIBLE
            binding.tvCancelPrompt.visibility = View.VISIBLE
            binding.cancelPromptContainer.visibility = View.GONE
            binding.circularProgress.onProgressAnimationEnd = null
        }
        binding.circularProgress.progress = 100f
    }

    private fun startCursorBlink() {
        val cursor = binding.thinkingCursor
        val anim = ObjectAnimator.ofFloat(cursor, View.ALPHA, 1f, 0f).apply {
            duration = 500
            repeatCount = ObjectAnimator.INFINITE
            repeatMode = ObjectAnimator.REVERSE
        }
        anim.start()
    }

    override fun onDestroy() {
        MessageController.detachUI()
        super.onDestroy()
    }

    override fun initEvent() {
        binding.cancelPromptContainer.setOnClickListener { showStopConfirmDialog() }
        binding.tvCancelPrompt.setOnClickListener {
            showStopTaskConfirmDialog()
        }
    }

    private fun showStopConfirmDialog() {
        val dialogView: View? = LayoutInflater.from(this).inflate(R.layout.view_stop_task_confirm, null)
        dialogView?.findViewById<TextView>(R.id.tv_cancel)?.setOnClickListener {
            stopTaskPlanDialog?.dismiss()
        }
        dialogView?.findViewById<TextView>(R.id.tv_confirm)?.setOnClickListener {
            MessageController.stopAutomationTask("Plan page cancel") { runOnUiThread { finish() } }
        }
        if (stopTaskPlanDialog == null){
            stopTaskPlanDialog = AlertDialog.Builder(this)
                .create();
            stopTaskPlanDialog?.show();
            stopTaskPlanDialog?.setCancelable(true);
            val window = stopTaskPlanDialog?.window
            window?.setContentView(dialogView);
            window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        }else {
            stopTaskPlanDialog?.show();
        }
    }

    private fun showStopTaskConfirmDialog() {
        val dialog = AlertDialog.Builder(this)
            .setTitle("ConfirmCancel？")
            .setMessage("Current task progress will be lost.")
            .setPositiveButton("ConfirmCancel") { _, _ ->
                MessageController.stopAutomationTask("Plan page cancel") {
                    runOnUiThread {
                        MessageController.cancelAndGotoSummarizer()
                        finish()
                    }
                }
            }
            .setNegativeButton("Continue Waiting", null)
            .create()

        dialog.show()
        dialog.window?.setBackgroundDrawableResource(R.drawable.bg_stop_task_dialog_rounded)

    }

    override fun initParam() {
        val imageUploader = ImageUploaderImpl("", ServerConstant.getURL())
        val clickFeedbackView = ClickFeedbackView(applicationContext)
        val actionExecutor = ActionExecutor(applicationContext, imageUploader, clickFeedbackView!!)

        MessageController.init(
            this,
            actionExecutor,
            object : MessageController.TabCheckCallback {
                override fun onCheck(tabIndex: Int) {
                }
            })
        MessageController.setMessageUpdateCallback(object :
            MessageController.MessageUpdateCallback {
            override fun addNewMessage(chatMessages: UIMessageBean) {
            }

            override fun updateLastMessageThought(content: String) {
                MarkwonManager.getInstance().setMarkdown(
                    this@PromptExecutionActivity,
                    binding.tvContent,
                    "${binding.tvContent.text}$content"
                )
                binding.thinkContentScrollContainer.fullScroll(ScrollView.FOCUS_DOWN)
            }

            override fun updateLastMessageSummary(content: String) {
            }

            override fun updateLastMessageFinalState(state: FinalStateEnum) {
            }

        })

        MessageController.setGuiAgentCallback(object : GuiAgentCallback {
            override fun guiAgentCallback() {
                runOnUiThread {
                    setCompleteState()
                    mainHandler.postDelayed({ finish() }, 1000L)
                }
            }
        })

        MessageController.setPhaseUpdateCallback(object : MessageController.PhaseUpdateCallback {
            override fun onSupervisorStart() {
                runOnUiThread {
                    updatePhase(ExecutionPhase.GENERATING_PLAN)
                }
            }

            override fun onToolCall(toolName: String) {
                runOnUiThread {
                    when {
                        toolName.contains("skill", ignoreCase = true) ->
                            updatePhase(ExecutionPhase.LOADING_SKILL)
                        toolName.contains("todo", ignoreCase = true) ->
                            updatePhase(ExecutionPhase.PLANNING_PATH)
                    }
                }
            }

            override fun onPlanningComplete() {
                runOnUiThread {
                    setCompleteState()
                }
            }
        })
    }

    interface GuiAgentCallback {
        fun guiAgentCallback()
    }
}
