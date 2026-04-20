package com.coremate.opengui.feature.promotor.ui.mine.preference.adapter

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.ui.mine.preference.pojo.ExecutePreferenceItemData
import com.lihang.ShadowLayout

class ExecutePreferenceListAdapter(private val onClick: IconClickListener) :
    RecyclerView.Adapter<ExecutePreferenceListAdapter.ViewHolder>() {
    private val data: MutableList<ExecutePreferenceItemData> = mutableListOf()

    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.execute_preference_item, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(
        holder: ViewHolder,
        position: Int
    ) {
        holder.bind(data[position], onClick)
    }

    override fun getItemCount(): Int {
        return data.size
    }

    fun setData(data: MutableList<ExecutePreferenceItemData>) {
        this.data.clear()
        this.data.addAll(data)
        notifyDataSetChanged()
    }

    class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val vSd = itemView.findViewById<ShadowLayout>(R.id.v_sd)
        private val llItem = itemView.findViewById<LinearLayout>(R.id.ll_item)
        private val title = itemView.findViewById<TextView>(R.id.tv_title)
        private val content = itemView.findViewById<TextView>(R.id.tv_content)
        private val contentContainer = itemView.findViewById<View>(R.id.content_container)
        private val imgControl = itemView.findViewById<ImageView>(R.id.img_control)

        fun bind(bean: ExecutePreferenceItemData, onclick: IconClickListener) {
            title.text = bean.title
            if (bean.tempMock) {
                contentContainer.visibility = View.GONE
                content.text = bean.content
                title.setTextColor(
                    ContextCompat.getColor(
                        itemView.context,
                        R.color.task_detail_empty_hint
                    )
                )
                imgControl.setImageResource(R.drawable.icon_add)
                llItem.setBackgroundResource(R.drawable.bg_execute_preference_no_content)
                vSd.setShadowLimit(0)
                vSd.setShadowColor(Color.TRANSPARENT)
            } else {
                contentContainer.visibility = View.VISIBLE
                content.text = bean.content
                title.setTextColor(
                    ContextCompat.getColor(
                        itemView.context,
                        R.color.task_detail_primary_text
                    )
                )
                imgControl.setImageResource(R.drawable.icon_edit)
                llItem.setBackgroundResource(R.drawable.bg_execute_preference_normal)
                vSd.setShadowLimit(AMScreenUtils.dp2px(8f))
                vSd.setShadowColor(Color.parseColor("#11000000"))
                vSd.setCornerRadius(AMScreenUtils.dp2px(16f))
            }
            llItem.setOnClickListener {
                onclick.onClick(bean)
            }
        }
    }

    interface IconClickListener {
        fun onClick(bean: ExecutePreferenceItemData)
    }
}