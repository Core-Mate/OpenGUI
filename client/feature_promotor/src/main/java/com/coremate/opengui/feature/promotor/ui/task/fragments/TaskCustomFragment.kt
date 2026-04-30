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


    private var isExpanded = false

    val RANDOM_TASKS = listOf(
        "Summarize major AI news from the past week and present it in a table.",
        "Monitor followed Bilibili creators and summarize the key points when a new video is published.",
        "Check my todo list at 5 PM every day and plan tomorrow's execution order for unfinished tasks.",
        "Analyze recent popular Xiaohongshu notes about minimalist living and extract 5 high-frequency keywords.",
        "Fetch the top 3 GitHub Trending repositories and briefly describe their functions and tech stacks.",
        "Monitor air quality in a specified city and email me to wear a mask and close windows if the index exceeds 100.",
        "Search and summarize three in-depth Apple Vision Pro reviews, comparing pros and cons.",
        "Create 5 catchy short-video titles about a programmer working from home.",
        "Search for the 3 best art exhibitions in Shanghai this month and list their addresses and ticket prices.",
        "Fetch the BTC price every 3 hours and notify me through a webhook if it rises more than 5%."
    )

    override fun initView() {

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
                    "Title cannot be empty",
                    Toast.LENGTH_SHORT
                ).show()
                return@setOnClickListener
            }
            if (descText.isEmpty()) {
                Toast.makeText(
                    this,
                    "Description cannot be empty",
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
                            AMToastUtils.showToast("Task created")
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
                .setTitle("Discard task?")
                .setMessage("Current content is not saved. Discard changes?")
                .setPositiveButton("Confirm") { dialog, _ ->
                    dialog.dismiss()
                    finish()
                }
                .setNegativeButton("Cancel") { dialog, _ ->
                    dialog.dismiss()
                }
                .create()

            alertDialog.show()
        }
    }

    /**
     */
    private fun setSoftInputMode(mode: Int) {
//        dialog?.window?.setSoftInputMode(
//            mode or WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
//        )
    }

    /**
     */
    private fun animateRootHeight(
        targetHeight: Int,
        targetMargin: Int
    ) {
        val rootParams = binding.llRoot.layoutParams as LinearLayout.LayoutParams
        val startHeight = binding.llRoot.height
        val inputParams = binding.fullInputTask.layoutParams as FrameLayout.LayoutParams
        val startMargin = inputParams.bottomMargin

        val animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 300
            interpolator = DecelerateInterpolator()

            addUpdateListener { animation ->
                val fraction = animation.animatedValue as Float

                val currentHeight = (startHeight + (targetHeight - startHeight) * fraction).toInt()
                rootParams.height = currentHeight
                binding.llRoot.layoutParams = rootParams

                val currentMargin = (startMargin + (targetMargin - startMargin) * fraction).toInt()
                inputParams.bottomMargin = currentMargin
                binding.fullInputTask.layoutParams = inputParams
            }


            addListener(object : Animator.AnimatorListener {
                override fun onAnimationStart(animation: Animator) {}

                override fun onAnimationEnd(animation: Animator) {

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


