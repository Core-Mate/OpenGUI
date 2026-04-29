package com.coremate.opengui.feature.promotor.ui.mine.payrecord

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R

private const val VIEW_TYPE_HEADER = 0
private const val VIEW_TYPE_ENTRY = 1

/**
 */
sealed class PayRecordListItem {
    data class Header(val dateLabel: String, val totalPoints: Double) : PayRecordListItem()
    data class Entry(
        val entry: ConsumptionEntry,
        val isFirstInGroup: Boolean,
        val isLastInGroup: Boolean
    ) : PayRecordListItem()
}

class PayRecordListAdapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private val flattened: MutableList<PayRecordListItem> = mutableListOf()

    override fun getItemViewType(position: Int): Int =
        when (flattened[position]) {
            is PayRecordListItem.Header -> VIEW_TYPE_HEADER
            is PayRecordListItem.Entry -> VIEW_TYPE_ENTRY
        }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder =
        when (viewType) {
            VIEW_TYPE_HEADER -> {
                val v = LayoutInflater.from(parent.context)
                    .inflate(R.layout.pay_record_date_header, parent, false)
                HeaderViewHolder(v)
            }
            else -> {
                val v = LayoutInflater.from(parent.context)
                    .inflate(R.layout.pay_record_entry_item, parent, false)
                EntryViewHolder(v)
            }
        }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val item = flattened[position]) {
            is PayRecordListItem.Header -> (holder as HeaderViewHolder).bind(item)
            is PayRecordListItem.Entry -> (holder as EntryViewHolder).bind(item)
        }
    }

    override fun getItemCount(): Int = flattened.size

    fun setData(list: List<ConsumptionRecordByDate>) {
        flattened.clear()
        list.forEach { group ->
            flattened.add(PayRecordListItem.Header(group.dateLabel, group.totalPoints))
            group.entries.forEachIndexed { index, entry ->
                flattened.add(
                    PayRecordListItem.Entry(
                        entry = entry,
                        isFirstInGroup = index == 0,
                        isLastInGroup = index == group.entries.size - 1
                    )
                )
            }
        }
        notifyDataSetChanged()
    }

    class HeaderViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvDateLabel = itemView.findViewById<TextView>(R.id.tv_date_label)
        private val tvDateTotal = itemView.findViewById<TextView>(R.id.tv_date_total)

        fun bind(header: PayRecordListItem.Header) {
            tvDateLabel.text = header.dateLabel
            tvDateTotal.text = "Total ${"%.1f".format(header.totalPoints)} Credits"
        }
    }

    class EntryViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvAppName = itemView.findViewById<TextView>(R.id.tv_app_name)
        private val tvTaskTitle = itemView.findViewById<TextView>(R.id.tv_task_title)
        private val tvTimeRange = itemView.findViewById<TextView>(R.id.tv_time_range)
        private val tvPoints = itemView.findViewById<TextView>(R.id.tv_points)
        private val dividerBottom = itemView.findViewById<View>(R.id.divider_bottom)
        private val entryItemRoot = itemView.findViewById<View>(R.id.entry_item_root)

        fun bind(item: PayRecordListItem.Entry) {
            val e = item.entry
            tvAppName.text = e.appName
            tvTaskTitle.text = e.taskTitle
            tvTimeRange.text = e.timeRange
            tvPoints.text = "-${"%.1f".format(e.points)}Credits"
            dividerBottom.visibility = if (item.isLastInGroup) View.GONE else View.VISIBLE
            entryItemRoot.setBackgroundResource(
                when {
                    item.isFirstInGroup && item.isLastInGroup -> R.drawable.bg_pay_record_entry_single
                    item.isFirstInGroup -> R.drawable.bg_pay_record_entry_first
                    item.isLastInGroup -> R.drawable.bg_pay_record_entry_last
                    else -> R.drawable.bg_pay_record_entry_middle
                }
            )
        }
    }
}
