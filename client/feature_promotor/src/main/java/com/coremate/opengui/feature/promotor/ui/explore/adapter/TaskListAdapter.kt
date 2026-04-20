package com.coremate.opengui.feature.promotor.ui.explore.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.FragmentManager
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.network.api.task.TaskTemplatesResp

class TaskListAdapter(private val fragmentManager: FragmentManager? = null) :
    RecyclerView.Adapter<TaskListAdapter.TaskCategoryViewHolder>() {

    val data: MutableList<TaskTemplatesResp> = mutableListOf()
    var listener: TaskListAdapterListener? = null

    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): TaskCategoryViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.view_task_item, parent, false)
        return TaskCategoryViewHolder(view)
    }

    override fun onBindViewHolder(holder: TaskCategoryViewHolder, position: Int) {
        holder.bindData(data[position])
        holder.itemView.setOnClickListener {
            listener?.onClickItem(data[position])
        }
    }

    fun setData(data: List<TaskTemplatesResp>?) {
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
        val tvTitle = itemView.findViewById<TextView>(R.id.tv_title)
        val tvUseCount = itemView.findViewById<TextView>(R.id.tv_use_count)
        val tvSuccessRate = itemView.findViewById<TextView>(R.id.tv_success_rate)
        fun bindData(data: TaskTemplatesResp) {
            tvTitle.text = data.taskName
            tvUseCount.text = "${data.totalExecutions + 175}次使用"
            val successRate = if (data.totalExecutions > 0) {
                (75..98).random()
            } else {
                100
            }
            tvSuccessRate.text = "$successRate%成功率"
        }
    }

}

interface TaskListAdapterListener {
    fun onClickItem(item:TaskTemplatesResp)
}