package com.coremate.opengui.feature.promotor.ui.task.adapter

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.common.bean.TaskCategoryBean

class TaskSheetCategoryListAdapter() :
    RecyclerView.Adapter<TaskSheetCategoryListAdapter.TaskCategoryViewHolder>() {

    val data: MutableList<TaskCategoryBean> = mutableListOf()

    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): TaskCategoryViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.view_sheet_task_category_item, parent, false)
        return TaskCategoryViewHolder(view)
    }

    override fun onBindViewHolder(holder: TaskCategoryViewHolder, position: Int) {
        val item = data[position]
        holder.bindData(item)
        holder.itemView.setOnClickListener {
            data.forEachIndexed { index, taskCategoryBean ->
                taskCategoryBean.isSelected = index == position
            }
            notifyDataSetChanged()
        }
    }

    override fun getItemCount(): Int {
        return data.size
    }

    fun setData(data: MutableList<TaskCategoryBean>) {
        this.data.clear()
        this.data.addAll(data)
        notifyDataSetChanged()
    }

    class TaskCategoryViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val text: TextView = itemView.findViewById(R.id.tv_text)
        fun bindData(data: TaskCategoryBean) {
            text.text = data.title
            if (data.isSelected) {
                text.setTextColor(Color.parseColor("#FFFFFF"))
                itemView.setBackgroundResource(R.drawable.bg_main_circle)
            } else {
                text.setTextColor(Color.parseColor("#9CA3AF"))
                itemView.setBackgroundResource(R.drawable.bg_gray_circle)
            }
        }
    }
}