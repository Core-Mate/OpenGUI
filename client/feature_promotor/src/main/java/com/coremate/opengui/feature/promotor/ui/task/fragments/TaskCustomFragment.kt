package com.coremate.opengui.feature.promotor.ui.task.fragments

import android.animation.Animator
import android.animation.ValueAnimator
import android.app.AlertDialog
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextUtils
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.WindowCompat
import androidx.core.view.postDelayed
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.gyf.immersionbar.ImmersionBar
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.automation.base.utils.AMToastUtils
import com.coremate.opengui.common.utils.KeyboardUtil
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.ActivityHomeBinding
import com.coremate.opengui.feature.promotor.databinding.ActivityHomeBinding.inflate
import com.coremate.opengui.feature.promotor.databinding.FragmentTaskCustomBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.task.CreateTaskReq
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Runnable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class TaskCustomFragment :
    BaseBindingActivity<FragmentTaskCustomBinding>(FragmentTaskCustomBinding::inflate) {
    private var apiService: ApiService? = null
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    var listener: TaskCustomFragmentListener? = null

    // 标记当前是否是展开状态
    private var isExpanded = false

    val RANDOM_TASKS = listOf(
        "帮我整理一份最近一周人工智能领域的重大新闻摘要，并以表格形式呈现。",
        "自动监控我关注的 B 站 UP 主，一旦有新视频发布就帮我总结视频的核心观点。",
        "每天下午 5 点检查我的待办清单，如果有未完成的任务，请帮我规划明天的执行顺序。",
        "分析最近小红书上关于“极简生活”的热门笔记，提取出 5 个高频关键词。",
        "抓取 GitHub Trending 榜单上前 3 名的仓库，简要描述它们的功能和技术栈。",
        "监控指定城市的空气质量，如果指数超过 100，发邮件提醒我带口罩并关闭窗户。",
        "搜索并汇总全网关于 Apple Vision Pro 的三条深度测评，对比优缺点。",
        "帮我起 5 个吸引人的短视频标题，主题是：程序员的居家办公生活。",
        "搜索最近一个月上海最值得去的 3 个艺术展，并列出地址和门票价格。",
        "每隔 3 小时自动抓取一次 BTC 价格，如果涨幅超过 5% 立即通过 Webhook 通知我。"
    )

    override fun initView() {
        // 进入页面后，标题输入框自动获取焦点并弹出键盘
        binding.etTitle.requestFocus()
        binding.etTitle.postDelayed({ KeyboardUtil.openKeyboard(this@TaskCustomFragment, binding.etTitle) }, 300)
    }

    override fun initEvent() {
        binding.imgClose.setOnClickListener {
            showAlert(true)
        }

        binding.fullInputTask.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(
                s: CharSequence?,
                start: Int,
                count: Int,
                after: Int
            ) {
            }

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                updateConfirmState()
            }

            override fun afterTextChanged(s: Editable?) {

            }
        })

        binding.tvTry.setOnClickListener {
            KeyboardUtil.closeKeyboard(binding.fullInputTask)
            val randomTask = RANDOM_TASKS.random()
            binding.fullInputTask.setText(randomTask)
        }

        // 点击内容输入框：
        // - 如果当前焦点不在内容输入框，则切换焦点并弹出键盘
        // - 如果当前焦点已在内容输入框，则仅隐藏键盘
        binding.fullInputTask.setOnClickListener {
            if (!binding.fullInputTask.hasFocus()) {
                binding.fullInputTask.requestFocus()
                Handler(Looper.getMainLooper()).postDelayed({
                    KeyboardUtil.openKeyboard(this, binding.fullInputTask)
                }, 300)
            } else {
                binding.imgClose.requestFocus()
                binding.fullInputTask.clearFocus()
                Handler(Looper.getMainLooper()).postDelayed({
                    KeyboardUtil.closeKeyboard(binding.fullInputTask)
                }, 300)
            }
        }

        binding.fullCancel.setOnClickListener {
            showAlert(true)
        }


        binding.llRoot.setOnClickListener {

        }

        binding.llContent.setOnClickListener {
            showAlert(false)
        }

        binding.flLoading.setOnClickListener {

        }

        binding.fullConfirm.setOnClickListener {
            val titleText = binding.etTitle.text?.toString()?.trim().orEmpty()
            val descText = binding.fullInputTask.text?.toString()?.trim().orEmpty()

            if (titleText.isEmpty()) {
                Toast.makeText(
                    this,
                    "标题不能为空",
                    Toast.LENGTH_SHORT
                ).show()
                return@setOnClickListener
            }
            if (descText.isEmpty()) {
                Toast.makeText(
                    this,
                    "描述不能为空",
                    Toast.LENGTH_SHORT
                ).show()
                return@setOnClickListener
            }
            binding.flLoading.visibility = View.VISIBLE
            coroutineScope.launch(Dispatchers.IO) {
                val text = descText
                val title = titleText.ifEmpty { text.take(15) }

                val bean = CreateTaskReq(
                    "$title",
                    text,
                    null,
                    null
                )
                runCatching {
                    apiService?.saveCustomTask(bean)
                }.onSuccess {
                    binding.flLoading.visibility = View.INVISIBLE
                    if (it?.code() == 201 || it?.code() == 200) {
                        launch(Dispatchers.Main) {
                            AMToastUtils.showToast("任务创建成功")
                            listener?.onCreateTaskSuc()
                            finish()
                        }
                    }
                }.onFailure {
                    binding.flLoading.visibility = View.INVISIBLE
                    it.printStackTrace()
                }
            }
        }

        updateConfirmState()
    }

    override fun initParam() {
        apiService = RetrofitClient.create(this)
    }

    private fun updateConfirmState() {
        if (binding.fullInputTask.text.isNotEmpty()) {
            binding.fullConfirm.alpha = 1f
            binding.fullConfirm.isEnabled = true
        } else {
            binding.fullConfirm.alpha = 0.5f
            binding.fullConfirm.isEnabled = false
        }
    }

    private fun showAlert(isForceClose: Boolean) {
        if (binding.fullInputTask.text.toString().isNotEmpty() || isForceClose) {
            KeyboardUtil.closeKeyboard(binding.fullInputTask)
            val alertDialog = AlertDialog.Builder(this)
                .setTitle("放弃创建?")
                .setMessage("当前内容尚未保存，确定要放弃吗？")
                .setPositiveButton("确定") { dialog, _ ->
                    dialog.dismiss()
                    finish()
                }
                .setNegativeButton("取消") { dialog, _ ->
                    dialog.dismiss()
                }
                .create()

            alertDialog.show()
        }
    }

    /**
     * 动态设置软键盘模式
     * @param mode 软键盘模式（ADJUST_PAN 或 ADJUST_RESIZE）
     */
    private fun setSoftInputMode(mode: Int) {
//        dialog?.window?.setSoftInputMode(
//            mode or WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
//        )
    }

    /**
     * 动画化 ll_root 高度和输入框 margin 的变化
     * @param targetHeight 目标高度（具体数值）
     * @param targetMargin 输入框目标底部 margin
     */
    private fun animateRootHeight(
        targetHeight: Int,
        targetMargin: Int
    ) {
        val rootParams = binding.llRoot.layoutParams as LinearLayout.LayoutParams
        val startHeight = binding.llRoot.height // 使用实际渲染高度
        val inputParams = binding.fullInputTask.layoutParams as FrameLayout.LayoutParams
        val startMargin = inputParams.bottomMargin

        val animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 300 // 动画时长 300ms
            interpolator = DecelerateInterpolator() // 减速插值器，让动画更自然

            addUpdateListener { animation ->
                val fraction = animation.animatedValue as Float
                // 平滑过渡 ll_root 高度
                val currentHeight = (startHeight + (targetHeight - startHeight) * fraction).toInt()
                rootParams.height = currentHeight
                binding.llRoot.layoutParams = rootParams
                // 平滑过渡输入框 margin
                val currentMargin = (startMargin + (targetMargin - startMargin) * fraction).toInt()
                inputParams.bottomMargin = currentMargin
                binding.fullInputTask.layoutParams = inputParams
            }

            // 动画结束后的回调
            addListener(object : Animator.AnimatorListener {
                override fun onAnimationStart(animation: Animator) {}

                override fun onAnimationEnd(animation: Animator) {
                    // 设置最终高度
                    rootParams.height = targetHeight
                    binding.llRoot.layoutParams = rootParams

                    inputParams.bottomMargin = targetMargin
                    binding.fullInputTask.layoutParams = inputParams
                }

                override fun onAnimationCancel(animation: Animator) {}

                override fun onAnimationRepeat(animation: Animator) {}
            })
        }

        animator.start()
    }

    interface TaskCustomFragmentListener {
        fun onCreateTaskSuc()
    }

}


