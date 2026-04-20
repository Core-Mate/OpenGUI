package com.coremate.opengui.feature.promotor.ui.taskdetail.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.FragmentManager
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.common.utils.TimeUtils
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.network.api.task.TaskHistoryRespItem

class TaskHistoryAdapter(private val fragmentManager: FragmentManager? = null) :
    RecyclerView.Adapter<TaskHistoryAdapter.TaskCategoryViewHolder>() {

    val data: MutableList<TaskHistoryRespItem> = mutableListOf()
    var listener: TaskHistoryAdapterListener? = null

    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): TaskCategoryViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.view_task_history_item, parent, false)
        return TaskCategoryViewHolder(view)
    }

    override fun onBindViewHolder(holder: TaskCategoryViewHolder, position: Int) {
        holder.bindData(data[position], listener)
    }

    fun setData(data: List<TaskHistoryRespItem>?) {
        try {
            this.data.clear()
            if (data?.isEmpty() != true) {
                this.data.addAll(data!!)
            }
            notifyDataSetChanged()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun getItemCount(): Int {
        return data.size
    }

    class TaskCategoryViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val llRoot: LinearLayout = itemView.findViewById(R.id.ll_root)
        private val tvTaskDoneLabel: TextView = itemView.findViewById(R.id.tv_task_done_label)
        private val tvTime: TextView = itemView.findViewById(R.id.tv_time)
        private val tvContent: TextView = itemView.findViewById(R.id.tv_content)

        fun bindData(data: TaskHistoryRespItem, listener: TaskHistoryAdapterListener?) {
            tvTaskDoneLabel.text = "任务完成"
            val datePart = TimeUtils.getHistoryDatePart(data.startedAt)
            val duration = TimeUtils.getHistoryDuration(data.startedAt, data.finishedAt)
            tvTime.text = if (datePart.isNotEmpty() && duration.isNotEmpty()) {
                "$datePart · $duration"
            } else if (duration.isNotEmpty()) {
                duration
            } else {
                ""
            }

            tvContent.text = if ("SUCCEED" == data.executionResult) "执行成功"  else if ("CANCELLED" == data.executionResult) "取消执行" else "执行失败"

            llRoot.setOnClickListener {
                listener?.onClickItem(data, tvTime.text.toString())
            }
        }
    }
}

interface TaskHistoryAdapterListener {
    fun onClickItem(item: TaskHistoryRespItem, timeText: String)
}
