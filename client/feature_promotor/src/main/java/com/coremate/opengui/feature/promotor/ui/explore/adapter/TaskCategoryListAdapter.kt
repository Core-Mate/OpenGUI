package com.coremate.opengui.feature.promotor.ui.explore.adapter

import android.content.res.ColorStateList
import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.common.bean.TaskCategoryBean

class TaskCategoryListAdapter() :
    RecyclerView.Adapter<TaskCategoryListAdapter.TaskCategoryViewHolder>() {

    val data: MutableList<TaskCategoryBean> = mutableListOf()

    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): TaskCategoryViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.view_task_category_item, parent, false)
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
        private val icon: ImageView = itemView.findViewById(R.id.img_icon)
        private val text: TextView = itemView.findViewById(R.id.tv_text)
        fun bindData(data: TaskCategoryBean) {
            icon.setImageResource(data.icon)
            text.text = data.title
            if (data.isSelected) {
                text.setTextColor(Color.parseColor("#FFFFFF"))
                itemView.setBackgroundResource(R.drawable.bg_main_circle)
                icon.imageTintList = ColorStateList.valueOf(Color.parseColor("#FFFFFF"))
            } else {
                text.setTextColor(Color.parseColor("#878895"))
                itemView.setBackgroundResource(R.drawable.bg_white_circle)
                icon.imageTintList = ColorStateList.valueOf(Color.parseColor("#878895"))
            }
        }
    }
}