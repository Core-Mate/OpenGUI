package com.coremate.opengui.feature.promotor.ui

import android.graphics.drawable.GradientDrawable
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R

class TaskColorAdapter(
    private val items: List<IntArray>,
    private val onSelect: (IntArray) -> Unit
) : RecyclerView.Adapter<TaskColorAdapter.ColorViewHolder>() {

    var selectedPosition: Int = RecyclerView.NO_POSITION
        private set

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ColorViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_task_color, parent, false)
        return ColorViewHolder(view)
    }

    override fun onBindViewHolder(holder: ColorViewHolder, position: Int) {
        val colors = items[position]
        holder.bind(colors, position == selectedPosition)
        holder.itemView.setOnClickListener {
            val old = selectedPosition
            selectedPosition = position
            notifyItemChanged(old)
            notifyItemChanged(position)
            onSelect(colors)
        }
    }

    override fun getItemCount(): Int = items.size

    class ColorViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val ringBlack: View = itemView.findViewById(R.id.ring_black)
        private val ringWhite: View = itemView.findViewById(R.id.ring_white)
        private val innerCircle: View = itemView.findViewById(R.id.inner_circle)

        fun bind(colors: IntArray, selected: Boolean) {
            // 设置内层渐变圆
            val drawable = GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                colors
            )
            drawable.shape = GradientDrawable.OVAL
            innerCircle.background = drawable

            // 选中显示同心圆描边，未选中隐藏
            val visibility = if (selected) View.VISIBLE else View.GONE
            ringBlack.visibility = visibility
            ringWhite.visibility = visibility
        }
    }
}


