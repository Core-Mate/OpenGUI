package com.coremate.opengui.feature.promotor.ui.taskdetail

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.provider.Settings
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.view.Window
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.recyclerview.widget.LinearLayoutManager
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.PermissionManager
import com.coremate.opengui.feature.promotor.databinding.ActivityPreviewTaskBinding
import com.coremate.opengui.feature.promotor.ui.execute.PromptExecutionActivity
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.feature.promotor.ui.base.context
import com.coremate.opengui.feature.promotor.ui.summarizer.SummarizerActivity
import com.coremate.opengui.feature.promotor.ui.views.PermissionDialogItem
import com.coremate.opengui.feature.promotor.ui.taskdetail.adapter.TaskHistoryAdapter
import com.coremate.opengui.feature.promotor.ui.taskdetail.adapter.TaskHistoryAdapterListener
import com.coremate.opengui.feature.promotor.ui.taskdetail.fragments.TaskEditDescFragment
import com.coremate.opengui.feature.promotor.ui.taskdetail.fragments.TaskMoreFragment
import com.coremate.opengui.network.api.mine.MyBalanceRespItem
import com.coremate.opengui.network.api.task.TaskHistoryRespItem
import com.coremate.opengui.network.api.task.TaskListRespItem
import com.coremate.opengui.network.api.task.TaskTemplatesResp

class TaskDetailActivity :
    BaseBindingActivity<ActivityPreviewTaskBinding>(ActivityPreviewTaskBinding::inflate),
    TaskHistoryAdapterListener {

    private var data: TaskListRespItem? = null
    private var presenter: TaskDetailPresenter? = null
    private var taskHistoryAdapter: TaskHistoryAdapter? = null
    private var permissionDialog: AlertDialog? = null
    private var originalTitle: String? = null
    private var originalPrompt: String? = null

    override fun initView() {
        binding.tvTaskName.text = data?.taskName ?: ""
        binding.tvTaskDescription.text = data?.taskDescription ?: ""
        taskHistoryAdapter = TaskHistoryAdapter()
        taskHistoryAdapter?.listener = this
        binding.executeHistoryRecyclerView.adapter = taskHistoryAdapter
        binding.executeHistoryRecyclerView.layoutManager = LinearLayoutManager(this)
    }

    override fun initEvent() {
        binding.titlebar.setTitle("任务详情").setLeftIconClickListener {
            finish()
        }.setRightIconClickListener {
            showTaskMoreMenu()
        }

        binding.cardNameContainer.setOnClickListener {
            showEditNameDialog()
        }
        binding.imgNameEdit.setOnClickListener {
            showEditNameDialog()
        }
        binding.btnEditDescription.setOnClickListener {
            showEditDescriptionDialog()
        }
        binding.llStart.setOnClickListener {
            val checkPermission = PermissionManager.checkPermission(this, "TaskDetailActivity - 点击开始执行")
            if (!checkPermission) {
                PermissionManager.showRequestPermissionWindow(this)
                return@setOnClickListener
            }
            val currentTitle = binding.tvTaskName.text.toString()
            val currentPrompt = binding.tvTaskDescription.text.toString()
            if (currentTitle != originalTitle || currentPrompt != originalPrompt) {
                presenter?.updateTask(
                    data?.id,
                    currentTitle,
                    currentPrompt,
                    this
                )
                return@setOnClickListener
            }
            TaskCenter.reset(binding.llStart.context, "我的任务 - 列表 - 重新执行")
            TaskCenter.taskId = data?.id
            TaskCenter.taskTitle = currentTitle
            TaskCenter.taskPrompt = currentPrompt
            val intent = Intent(this@TaskDetailActivity, PromptExecutionActivity::class.java)
            intent.putExtra("prompt", currentPrompt.trim())
            intent.putExtra("taskId", data?.id)
            startActivity(intent)
        }
    }

    override fun initParam() {
        presenter = TaskDetailPresenter(this)
        data = intent.getSerializableExtra("data") as? TaskListRespItem
        originalTitle = data?.taskName
        originalPrompt = data?.taskDescription
    }

    override fun onResume() {
        super.onResume()
        presenter?.getTaskHistory(data?.id, this)
    }

    /// 更多
    private fun showTaskMoreMenu() {
        val bottomSheetDialog = TaskMoreFragment()
        bottomSheetDialog.show(
            supportFragmentManager,
            TaskMoreFragment::class.java.simpleName
        )
        bottomSheetDialog.listener = object : TaskMoreFragment.TaskMoreFragmentListener {
            override fun onClickDel() {
                showDeleteConfirmDialog()
            }
        }
    }

    private fun copyTaskNameToClipboard() {
        val name = binding.tvTaskName.text.toString()
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        if (cm != null && name.isNotEmpty()) {
            cm.setPrimaryClip(ClipData.newPlainText("task_name", name))
            Toast.makeText(this, "已复制到剪贴板", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "复制失败", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showDeleteConfirmDialog() {
        AlertDialog.Builder(this)
            .setTitle("删除任务")
            .setMessage("确定要删除该任务吗？")
            .setPositiveButton("删除") { _, _ ->
                presenter?.deleteTask(data?.id) { success ->
                    if (success) {
                        Toast.makeText(this, "已删除", Toast.LENGTH_SHORT).show()
                        finish()
                    } else {
                        Toast.makeText(this, "删除失败", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("取消", null)
            .show()
    }

    ///编辑任务名称
    private fun showEditNameDialog() {
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_edit_task_field, null)
        val tvTitle = view.findViewById<android.widget.TextView>(R.id.tv_dialog_title)
        val etInput = view.findViewById<android.widget.EditText>(R.id.et_dialog_input)
        val btnCancel = view.findViewById<android.widget.TextView>(R.id.btn_dialog_cancel)
        val flClose = view.findViewById<FrameLayout>(R.id.fl_close)
        val btnSave = view.findViewById<android.widget.TextView>(R.id.btn_dialog_save)
        tvTitle.text = "编辑任务名称"
        etInput.setText(binding.tvTaskName.text)
        etInput.setSelection(etInput.text?.length ?: 0)
        etInput.inputType = InputType.TYPE_CLASS_TEXT
        etInput.maxLines = 1
        val dialog = AlertDialog.Builder(this)
            .setView(view)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        btnCancel.setOnClickListener { dialog.dismiss() }
        flClose.setOnClickListener { dialog.dismiss() }
        btnSave.setOnClickListener {
            val newTitle = etInput.text.toString().trim()
            if (newTitle.isEmpty()) {
                Toast.makeText(this, "名称不能为空", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            dialog.dismiss()
            val currentPrompt = binding.tvTaskDescription.text.toString()
            binding.flLoading.visibility = View.VISIBLE
            presenter?.updateTaskOnly(data?.id, newTitle, currentPrompt) { resp ->
                binding.flLoading.visibility = View.INVISIBLE
                if (resp != null) {
                    binding.tvTaskName.text = newTitle
                    originalTitle = newTitle
                    Toast.makeText(this, "名称已更新", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                } else {
                    Toast.makeText(this, "更新失败", Toast.LENGTH_SHORT).show()
                }
            }
        }
        dialog.show()
    }


    ///编辑任务描述
    private fun showEditDescriptionDialog() {

        val bottomSheetDialog =
            TaskEditDescFragment.newInstance(binding.tvTaskDescription.text.toString())
        bottomSheetDialog.show(
            supportFragmentManager,
            TaskEditDescFragment::class.java.simpleName
        )
        bottomSheetDialog.listener = object : TaskEditDescFragment.TaskEditDescFragmentListener {
            override fun onInputEditDesc(desc: String) {
                val newPrompt = desc.trim()
                val currentTitle = binding.tvTaskName.text.toString()
                binding.flLoading.visibility = View.VISIBLE
                presenter?.updateTaskOnly(data?.id, currentTitle, newPrompt) { resp ->
                    binding.flLoading.visibility = View.INVISIBLE
                    if (resp != null) {
                        binding.tvTaskDescription.text = newPrompt
                        originalPrompt = newPrompt
                        Toast.makeText(context, "描述已更新", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(context, "更新失败", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
        //TODO:
//        val view = LayoutInflater.from(this).inflate(R.layout.dialog_edit_task_field_note, null)
//        val tvTitle = view.findViewById<android.widget.TextView>(R.id.tv_dialog_title)
//        val etInput = view.findViewById<android.widget.EditText>(R.id.et_dialog_input)
//        val btnCancel = view.findViewById<android.widget.TextView>(R.id.btn_dialog_cancel)
//        val btnSave = view.findViewById<android.widget.TextView>(R.id.btn_dialog_save)
//        tvTitle.text = "编辑任务描述"
//        etInput.setText(binding.tvTaskDescription.text)
//        etInput.setSelection(etInput.text?.length ?: 0)
//        etInput.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
//        etInput.minHeight =
//            resources.getDimensionPixelSize(R.dimen.dialog_edit_description_min_height)
//        etInput.maxLines = 20
//        val dialog = AlertDialog.Builder(this)
//            .setView(view)
//            .create()
//        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
//        btnCancel.setOnClickListener { dialog.dismiss() }
//        btnSave.setOnClickListener {
//            val newPrompt = etInput.text.toString().trim()
//            val currentTitle = binding.tvTaskName.text.toString()
//            presenter?.updateTaskOnly(data?.id, currentTitle, newPrompt) { resp ->
//                if (resp != null) {
//                    binding.tvTaskDescription.text = newPrompt
//                    originalPrompt = newPrompt
//                    Toast.makeText(this, "描述已更新", Toast.LENGTH_SHORT).show()
//                    dialog.dismiss()
//                } else {
//                    Toast.makeText(this, "更新失败", Toast.LENGTH_SHORT).show()
//                }
//            }
//        }
//        dialog.show()
    }

    fun updateTaskHistory(data: List<TaskHistoryRespItem>?) {
        runOnUiThread {
            if (data?.isEmpty() == true) {
                binding.executeHistoryRecyclerView.visibility = View.GONE
                binding.tvEmptyHint.visibility = View.VISIBLE
            } else {
                binding.executeHistoryRecyclerView.visibility = View.VISIBLE
                binding.tvEmptyHint.visibility = View.GONE
                taskHistoryAdapter?.setData(data)
            }
        }
    }

    fun updateTaskResult(result: Boolean, resp: TaskTemplatesResp?) {
        runOnUiThread {
            if (result && resp != null) {
                TaskCenter.reset(this@TaskDetailActivity, "我的任务 - 任务详情 - 更新并执行")
                TaskCenter.taskId = resp.id
                TaskCenter.taskTitle = resp.taskName
                TaskCenter.taskPrompt = resp.taskDescription
                val intent = Intent(this@TaskDetailActivity, PromptExecutionActivity::class.java)
                intent.putExtra("prompt", resp.taskDescription.trim())
                intent.putExtra("taskId", resp.id)
                startActivity(intent)
            }
        }
    }

    override fun onClickItem(item: TaskHistoryRespItem, timeText: String) {
        val intent = Intent(this, SummarizerActivity::class.java)
        TaskCenter.executionId = item.id
        intent.putExtra("id", data?.id ?: "")
        intent.putExtra("from", "MyTask")
        intent.putExtra("taskName", data?.taskName ?: "")
        intent.putExtra("historyId", item.id)
        intent.putExtra("timeText", timeText)
        intent.putExtra("executionResult", item.executionResult)
        startActivity(intent)
    }
}
