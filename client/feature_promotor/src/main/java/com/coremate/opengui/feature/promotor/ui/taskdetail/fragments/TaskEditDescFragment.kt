package com.coremate.opengui.feature.promotor.ui.taskdetail.fragments

import android.animation.Animator
import android.animation.ValueAnimator
import android.app.AlertDialog
import android.graphics.Color
import android.os.Bundle
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
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.gyf.immersionbar.ImmersionBar
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.common.utils.KeyboardUtil
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.FragmentTaskEditDescBinding

class TaskEditDescFragment : BottomSheetDialogFragment() {

    companion object {
        private const val KEY_CONTENT = "key_content"

        fun newInstance(title: String): TaskEditDescFragment {
            return TaskEditDescFragment().apply {
                arguments = Bundle().apply {
                    putString(KEY_CONTENT, title)
                }
            }
        }
    }

    private lateinit var binding: FragmentTaskEditDescBinding

    var listener: TaskEditDescFragmentListener? = null
    private var isExpanded = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, R.style.BottomSheetDialog)

    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentTaskEditDescBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val title = arguments?.getString(KEY_CONTENT)
        binding.fullInputTask.setText(title)

        binding.llContent.setOnClickListener {
            showAlert(false)
        }
        binding.llRoot.setOnClickListener {  }

        binding.flClose.setOnClickListener {
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


        binding.fullCancel.setOnClickListener {
            showAlert(true)
        }

        binding.flTransBg.setOnClickListener {
            KeyboardUtil.closeKeyboard(binding.fullInputTask)
            isExpanded = !isExpanded
            
            if (isExpanded) {
                // 展开状态：切换到 ADJUST_PAN 模式，键盘不推动布局
                setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN)
                binding.ivTrans.setImageResource(R.drawable.ic_no_expend)
                
                // 动画化 ll_root 的高度
                animateRootHeight(
                    targetHeight = AMScreenUtils.screenHeight() - ImmersionBar.getStatusBarHeight(
                        this
                    ) - AMScreenUtils.dp2px(56f),
                    targetMargin = 0
                )
            } else {
                // 收缩状态：切换到 ADJUST_RESIZE 模式，键盘推动布局
                setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
                binding.ivTrans.setImageResource(R.drawable.ic_expend)
                
                // 动画化 ll_root 的高度
                animateRootHeight(
                    targetHeight = (resources.displayMetrics.heightPixels * 0.4).toInt(),
                    targetMargin = AMScreenUtils.dp2px(50f)
                )
            }
        }

        binding.fullConfirm.setOnClickListener {
            if (TextUtils.isEmpty(binding.fullInputTask.text)) {
                Toast.makeText(
                    context,
                    "描述不能为空",
                    Toast.LENGTH_SHORT
                )
                return@setOnClickListener
            }
            dismiss()
            listener?.onInputEditDesc(binding.fullInputTask.text.toString())
        }

        updateConfirmState()
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

   private fun showAlert(isForceClose:Boolean) {
        if (binding.fullInputTask.text.toString().isNotEmpty() || isForceClose) {
            KeyboardUtil.closeKeyboard(binding.fullInputTask)
            val alertDialog = AlertDialog.Builder(requireContext())
                .setTitle("放弃修改?")
                .setMessage("当前内容尚未保存，确定要放弃吗？")
                .setPositiveButton("确定") { dialog, _ ->
                    dialog.dismiss()
                    dismiss()
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
        dialog?.window?.setSoftInputMode(
            mode or WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
        )
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

    override fun onStart() {
        super.onStart()
        val bottomSheet =
            dialog?.findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)
        if (bottomSheet != null) {
            // BottomSheet 保持全屏高度
            val params = bottomSheet.layoutParams as CoordinatorLayout.LayoutParams
            params.width = FrameLayout.LayoutParams.MATCH_PARENT
            params.height = FrameLayout.LayoutParams.MATCH_PARENT
            bottomSheet.layoutParams = params
            val behavior = BottomSheetBehavior.from(bottomSheet).apply {
//                isFitToContents = false
//                peekHeight = 730.dpToPx(requireContext())
            }
        }
        
        // 设置 ll_root 的初始高度为 40%
        val rootParams = binding.llRoot.layoutParams as LinearLayout.LayoutParams
        rootParams.height = (resources.displayMetrics.heightPixels * 0.4).toInt()
        binding.llRoot.layoutParams = rootParams

        if (dialog != null) {
            val window = dialog!!.window
            if (window != null) {
                // 初始状态是收缩的，使用 ADJUST_RESIZE 让键盘推动布局
                window.setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                            WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
                )

                // Make dialog window layout fullscreen so the dim covers status bar
                WindowCompat.setDecorFitsSystemWindows(window, false)
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
                window.setStatusBarColor(Color.TRANSPARENT)
//                window.setLayout(
//                    ViewGroup.LayoutParams.MATCH_PARENT,
//                    ViewGroup.LayoutParams.MATCH_PARENT
//                )
            }

            if (dialog is BottomSheetDialog) {
                val dialog = dialog as BottomSheetDialog?
                val bottomSheet =
                    dialog!!.findViewById<View?>(com.google.android.material.R.id.design_bottom_sheet)
                if (bottomSheet != null) {
                    val behavior = BottomSheetBehavior.from<View?>(bottomSheet)
                    behavior.skipCollapsed = true
                    behavior.setState(BottomSheetBehavior.STATE_EXPANDED)
                    // 禁止通过手指下滑关闭对话框
                    behavior.isDraggable = false
                }
            }
        }
    }

    interface TaskEditDescFragmentListener {
        fun onInputEditDesc(desc: String)
    }

}


