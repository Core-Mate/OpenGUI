package com.coremate.opengui.feature.promotor.ui.fragments

import android.app.Dialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.TextUtils
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.coremate.opengui.automation.base.utils.AMScreenUtils.Companion.dp2px
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.PermissionManager
import com.coremate.opengui.feature.promotor.ui.fragments.presenter.EditPromptPresenter
import com.coremate.opengui.feature.promotor.databinding.EditPromptFragmentBinding
import com.coremate.opengui.feature.promotor.ui.views.PermissionDialogItem
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class EditPromptFragment : BottomSheetDialogFragment() {

    private lateinit var binding: EditPromptFragmentBinding
    private lateinit var dialog: AlertDialog
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null
    private var originalPrompt: String? = null
    private var from: String? = null
    private var presenter: EditPromptPresenter? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
//        setStyle(STYLE_NORMAL, R.style.BottomSheetDialog)
    }


    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        apiService = RetrofitClient.create(requireContext())
        val dialog = super.onCreateDialog(savedInstanceState)
        dialog.setOnShowListener {
            val bottomSheet =
                dialog.findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)
            bottomSheet?.let {
                val behavior = BottomSheetBehavior.from(it)
                behavior.state = BottomSheetBehavior.STATE_EXPANDED
                behavior.skipCollapsed = true
                behavior.isFitToContents = true
            }
        }


        dialog.window?.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        )
        return dialog
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View? {
        binding = EditPromptFragmentBinding.inflate(layoutInflater, container, false)
        presenter = EditPromptPresenter(this)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        arguments?.getString(ARG_FROM)?.let {
            this.from = it
        }


        when (from) {
            "MyTask" -> {
                binding.iconEditPromptAdd.setImageResource(R.drawable.icon_edit_prompt_add_disable)
                binding.tvEditPromptAdd.setTextColor(Color.parseColor("#bfbfbf"))
                binding.llSaveTask.isClickable = false
            }

            "TaskSquare" -> {
                binding.iconEditPromptAdd.setImageResource(R.drawable.icon_edit_prompt_add_enable)
                binding.tvEditPromptAdd.setTextColor(Color.parseColor("#000000"))
                binding.llSaveTask.isClickable = true
            }
        }

        binding.etPrompt.setText(TaskCenter.taskPrompt)
        binding.tvTitle.text = TaskCenter.taskTitle
        this.originalPrompt = TaskCenter.taskPrompt

        if ("MyTask" == this.from) { // Entered from My Tasks.

            binding.etPrompt.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(
                    p0: CharSequence?, p1: Int, p2: Int, p3: Int
                ) {
                }

                override fun onTextChanged(
                    p0: CharSequence?, p1: Int, p2: Int, p3: Int
                ) {
                    updateAddButtonState(p0?.toString())
                }

                override fun afterTextChanged(p0: Editable?) {
                }
            })
        } else {
            binding.iconEditPromptAdd.setImageResource(R.drawable.icon_edit_prompt_add_enable)
            binding.tvEditPromptAdd.setTextColor(Color.parseColor("#000000"))
            binding.llSaveTask.isClickable = true
        }

        binding.imgBack.setOnClickListener {
            dismiss()
        }
        binding.imgClose.setOnClickListener {
            dismiss()
        }
        binding.startPromptContainer.setOnClickListener {
            if (TextUtils.isEmpty(binding.etPrompt.text)) {
                return@setOnClickListener
            }
            val checkPermission = PermissionManager.checkPermission(
                requireContext(),
                "EditPromptFragment - startPromptContainer"
            )
            if (!checkPermission) {
                PermissionManager.showRequestPermissionWindow(requireContext())
                return@setOnClickListener
            }
            when (from) {
                "MyTask" -> {
                    if (this.originalPrompt?.equals(binding.etPrompt.text.toString()) == true) {
                        presenter?.executeTask()
                    } else {
                        presenter?.updateAndExecuteTask(
                            TaskCenter.taskId!!,
                            binding.etPrompt.text.toString()
                        )
                    }
                }

                "TaskSquare" -> {
                    presenter?.createAndExecuteTask(
                        TaskCenter.taskTitle!!,
                        binding.etPrompt.text.toString()
                    )
                }
            }
        }
        binding.llSaveTask.setOnClickListener {
            if (TextUtils.isEmpty(binding.etPrompt.text)) {
                return@setOnClickListener
            }
            when (from) {
                "MyTask" -> {
                    presenter?.updateTask(
                        TaskCenter.taskId,
                        binding.etPrompt.text.toString().trim()
                    )
                }

                "TaskSquare" -> {
                    presenter?.createTask(
                        TaskCenter.taskTitle!!,
                        binding.etPrompt.text.toString().trim()
                    )
                }
            }
        }
    }

    private fun updateAddButtonState(currentText: String?) {
        val isSameAsOriginal = currentText?.trim() == originalPrompt?.trim()
        if (isSameAsOriginal && from == "MyTask") {
            binding.iconEditPromptAdd.setImageResource(R.drawable.icon_edit_prompt_add_disable)
            binding.tvEditPromptAdd.setTextColor(Color.parseColor("#bfbfbf"))
            binding.llSaveTask.isClickable = false
        } else {
            binding.iconEditPromptAdd.setImageResource(R.drawable.icon_edit_prompt_add_enable)
            binding.tvEditPromptAdd.setTextColor(Color.parseColor("#000000"))
            binding.llSaveTask.isClickable = true
        }
    }

    suspend fun updateTaskResult(isSuccess: Boolean) {
        if (isSuccess) {
            binding.iconEditPromptAdd.setImageResource(R.drawable.icon_edit_prompt_add_disable)
            binding.tvEditPromptAdd.setTextColor(Color.parseColor("#bfbfbf"))
            binding.llSaveTask.isClickable = false
            Toast.makeText(requireContext(), "Task updated", Toast.LENGTH_SHORT).show()
            AutomationEventBus.publish(AutomationEvent.UpdateMyTask)
        } else {
            Toast.makeText(requireContext(), "Task update failed", Toast.LENGTH_SHORT).show()
        }
    }

    suspend fun createTaskResult(isSuccess: Boolean) {
        if (isSuccess) {
            Toast.makeText(requireContext(), "TaskSaved successfully", Toast.LENGTH_SHORT).show()
            AutomationEventBus.publish(AutomationEvent.UpdateMyTask)
        } else {
            Toast.makeText(requireContext(), "Task save failed", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        const val ARG_FROM = "from"

        /**
         */
        fun newInstance(
            from: String
        ): EditPromptFragment {
            return EditPromptFragment().apply {
                arguments = Bundle().apply {
                    putString(ARG_FROM, from)
                }
            }
        }
    }
}
