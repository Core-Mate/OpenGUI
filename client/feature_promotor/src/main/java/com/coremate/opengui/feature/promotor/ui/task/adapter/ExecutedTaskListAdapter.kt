package com.coremate.opengui.feature.promotor.ui.task.adapter

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.FragmentManager
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.common.utils.TimeUtils
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.ui.execute.PromptExecutionActivity
import com.coremate.opengui.feature.promotor.ui.views.PermissionDialogItem
import com.coremate.opengui.feature.promotor.ui.taskdetail.TaskDetailActivity
import com.coremate.opengui.feature.promotor.ui.task.MyTaskPresenter
import com.coremate.opengui.network.api.task.TaskListRespItem
import androidx.core.graphics.drawable.toDrawable
import androidx.core.graphics.toColorInt
import com.coremate.opengui.feature.promotor.PermissionManager

class ExecutedTaskListAdapter(
    private val fragmentManager: FragmentManager? = null,
    private val presenter: MyTaskPresenter
) :
    RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        private const val VIEW_TYPE_ITEM = 0
        private const val VIEW_TYPE_FOOTER = 1
    }

    private val showData: MutableList<TaskListRespItem> = mutableListOf()
    private val normalData: MutableList<TaskListRespItem> = mutableListOf()
    private val searchData: MutableList<TaskListRespItem> = mutableListOf()

    override fun getItemViewType(position: Int): Int {
        return if (position == showData.size) VIEW_TYPE_FOOTER else VIEW_TYPE_ITEM
    }

    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): RecyclerView.ViewHolder {
        return if (viewType == VIEW_TYPE_FOOTER) {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_my_task_list_footer, parent, false)
            FooterViewHolder(view)
        } else {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.executed_task_list_item, parent, false)
            ViewHolder(view)
        }
    }

    override fun onBindViewHolder(
        holder: RecyclerView.ViewHolder,
        position: Int
    ) {
        if (holder is ViewHolder) {
            holder.bindData(showData[position], showData, fragmentManager, presenter, this)
        }
    }

    override fun getItemCount(): Int {
        return showData.size + 1
    }

    class FooterViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView)

    fun setData(data: List<TaskListRespItem>?) {
        try {
            this.normalData.clear()
            this.showData.clear()
            if (data?.isEmpty() != true) {
                this.showData.addAll(data!!)
                this.normalData.addAll(data)
            }
            notifyDataSetChanged()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun addData(data: List<TaskListRespItem>?) {
        try {
            if (data?.isEmpty() != true) {
                val startPosition = this.showData.size
                this.showData.addAll(data!!)
                this.normalData.addAll(data)
                notifyItemRangeInserted(startPosition, data.size)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun setSearchData(data: List<TaskListRespItem>) {
        runCatching {
            Handler(Looper.getMainLooper()).post {
                this.searchData.clear()
                this.searchData.addAll(data)
                this.showData.clear()
                this.showData.addAll(data)
                notifyDataSetChanged()
            }
        }
    }

    fun cancelSearchMode() {
        runCatching {
            Handler(Looper.getMainLooper()).post {
                this.searchData.clear()
                this.showData.clear()
                this.showData.addAll(normalData)
                notifyDataSetChanged()
            }
        }
    }


    fun removeItem(item: TaskListRespItem) {
        runCatching {
            Handler(Looper.getMainLooper()).post {
                val position = showData.indexOf(item)
                if (position != -1) {
                    showData.removeAt(position)
                    notifyItemRemoved(position)
                    notifyItemRangeChanged(position, showData.size - position)
                }
            }
        }
    }

    class ViewHolder(itemView: View) :
        RecyclerView.ViewHolder(itemView) {
        val root: LinearLayout = itemView.findViewById(R.id.root)
        val refresh: FrameLayout = itemView.findViewById(R.id.ll_refresh)
        val tvTitle: TextView = itemView.findViewById(R.id.tv_title)

        //        val count: TextView = itemView.findViewById(R.id.count)
        val tvLastExecuteTime: TextView = itemView.findViewById(R.id.tv_last_execute_time)
        val imgMenu: ImageView = itemView.findViewById(R.id.img_menu)
        var presenter: MyTaskPresenter? = null
        fun bindData(
            data: TaskListRespItem,
            datas: MutableList<TaskListRespItem>,
            fragmentManager: FragmentManager?,
            presenter: MyTaskPresenter,
            adapter: ExecutedTaskListAdapter
        ) {
            try {
                this.presenter = presenter
                tvTitle.text = data.taskName
//                count.text = "Executed ${data.totalExecutions} times"
//                if (data.totalExecutions == 0L) {
//                    btReplay.text = "StartRun"
//                } else {
//                    btReplay.text = "Run Again"
//                }
                if (data.lastExecution != null && data.lastExecution?.finishedAt != null) {
                    tvLastExecuteTime.text =
                        TimeUtils.convertUtcToBeijing(data.lastExecution?.finishedAt)
                } else {
                    tvLastExecuteTime.text = "Not run yet"
                }
                root.setOnClickListener {
                    val intent = Intent(tvTitle.context, TaskDetailActivity::class.java)
                    intent.putExtra("data", data)
                    root.context.startActivity(intent)
                }
                refresh.setOnClickListener {
                    val checkPermission = PermissionManager.checkPermission(refresh.context, "My Tasks - List - Run Again")
                    if (!checkPermission) {
                        PermissionManager.showRequestPermissionWindow(refresh.context)
                        return@setOnClickListener
                    }
                    TaskCenter.reset(refresh.context,"My Tasks - List - Run Again")
                    TaskCenter.taskId = data.id
                    TaskCenter.taskTitle = data.taskName
                    TaskCenter.taskPrompt = data.taskDescription
                    val intent = Intent(itemView.context, PromptExecutionActivity::class.java)
                    intent.putExtra("prompt", data.taskDescription.trim())
                    intent.putExtra("taskId", data.id)
                    itemView.context.startActivity(intent)
                }
                imgMenu.setOnClickListener {
                    showMenuPopupWindow(imgMenu, data, datas, fragmentManager, adapter)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        private var menuPopupWindow: PopupWindow? = null
        private fun showMenuPopupWindow(
            anchorView: View,
            data: TaskListRespItem,
            datas: MutableList<TaskListRespItem>,
            fragmentManager: FragmentManager?,
            adapter: ExecutedTaskListAdapter
        ) {

            if (menuPopupWindow != null && menuPopupWindow!!.isShowing) {
                menuPopupWindow!!.dismiss()
                return
            }
            val inflater = LayoutInflater.from(itemView.context)
            val popupView = inflater.inflate(R.layout.popup_task_menu, null)
//            val tvEdit = popupView.findViewById<TextView>(R.id.tv_edit)
            val tvDelete = popupView.findViewById<LinearLayout>(R.id.action_delete)

            tvDelete.setOnClickListener {
                menuPopupWindow?.dismiss()
                showDeleteConfirmDialog(data, adapter)
            }
            menuPopupWindow = PopupWindow(
                popupView,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                true
            )

            menuPopupWindow?.setBackgroundDrawable(Color.TRANSPARENT.toDrawable())
            menuPopupWindow?.isOutsideTouchable = true
            menuPopupWindow?.isFocusable = true

            menuPopupWindow?.showAsDropDown(
                anchorView,
                AMScreenUtils.dp2px(-30f),
                0,
                Gravity.CENTER
            )
        }

        private var deleteConfirmDialog: AlertDialog? = null

        private fun showDeleteConfirmDialog(
            data: TaskListRespItem,
            adapter: ExecutedTaskListAdapter
        ) {
            deleteConfirmDialog?.dismiss()
            deleteConfirmDialog = AlertDialog.Builder(itemView.context)
                .setTitle("ConfirmDelete")
                .setMessage("Delete this task?")
                .setNegativeButton("Cancel") { dialog, _ ->
                    dialog.dismiss()
                }
                .setPositiveButton("Confirm") { dialog, _ ->
                    presenter?.deleteTask(data.id, object : MyTaskPresenter.DeleteTaskCallback {
                        override fun callback(success: Boolean) {
                            if (success) {
                                adapter.removeItem(data)
                            }
                        }
                    })
                    dialog.dismiss()
                }
                .create()

            deleteConfirmDialog?.setCanceledOnTouchOutside(true)
            deleteConfirmDialog?.show()

            val cornerDrawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = AMScreenUtils.dp2px(12f).toFloat()
                setColor(Color.WHITE)
            }
            deleteConfirmDialog?.window?.setBackgroundDrawable(cornerDrawable)

            deleteConfirmDialog?.getButton(AlertDialog.BUTTON_POSITIVE)?.setTextColor("#1677FF".toColorInt())
            deleteConfirmDialog?.getButton(AlertDialog.BUTTON_NEGATIVE)?.setTextColor("#999999".toColorInt())
        }
    }
}
