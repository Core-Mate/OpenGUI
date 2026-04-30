package com.coremate.opengui.feature.promotor.ui.explore.adapter

import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.network.api.task.TaskTemplatesResp

class RecommendListAdapter() : RecyclerView.Adapter<RecommendListAdapter.RecommendViewHolder>() {

    val data: MutableList<TaskTemplatesResp> = mutableListOf()
    var listener: TaskListAdapterListener? = null

    override fun onCreateViewHolder(
        parent: android.view.ViewGroup,
        viewType: Int
    ): RecommendViewHolder {
        val view = android.view.LayoutInflater.from(parent.context)
            .inflate(R.layout.view_recommend_list_item, parent, false)
        return RecommendViewHolder(view)
    }

    override fun onBindViewHolder(holder: RecommendViewHolder, position: Int) {
        holder.bindData(data[position])
        holder.itemView.setOnClickListener {
            listener?.onClickItem(data[position])
        }
    }

    fun setData(data: List<TaskTemplatesResp>?) {
        this.data.clear()

        data?.let {
            if (it.size > 3) {
                this.data.addAll(it.take(3))
            } else {
                this.data.addAll(it)
            }
        }
        notifyDataSetChanged()
    }


    override fun getItemCount(): Int {
        return data.size
    }


    class RecommendViewHolder(itemView: android.view.View) : RecyclerView.ViewHolder(itemView) {
        val tvTitle = itemView.findViewById<TextView>(R.id.template_title)
        val tvUseCount = itemView.findViewById<TextView>(R.id.template_usage)
        fun bindData(data: TaskTemplatesResp) {
            tvTitle.text = data.taskName
            tvUseCount.text = "${data.totalExecutions + 175} uses"

        }
    }
}