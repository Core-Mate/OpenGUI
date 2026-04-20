package com.coremate.opengui.feature.promotor.ui.mine.preference.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.ui.mine.preference.pojo.ExecutePreferenceSubListItemData
import kotlin.collections.mutableListOf

class ExecutePreferenceSubListAdapter(private val onClick: View.OnClickListener) :
    RecyclerView.Adapter<ExecutePreferenceSubListAdapter.ViewHolder>() {

    private val data: MutableList<ExecutePreferenceSubListItemData> = mutableListOf()

    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.execute_preference_sub_list_item, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(
        holder: ViewHolder,
        position: Int
    ) {
        holder.bind(data[position])
        holder.itemView.setOnClickListener {
            onClick.onClick(it)

        }
    }

    override fun getItemCount(): Int {
        return data.size
    }

    fun setData(data: MutableList<ExecutePreferenceSubListItemData>) {
        this.data.clear()
        this.data.addAll(data)
        notifyDataSetChanged()
    }


    class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val title = itemView.findViewById<TextView>(R.id.tv_title)
        fun bind(bean: ExecutePreferenceSubListItemData) {
            title.text = bean.title
        }
    }
}