package com.coremate.opengui.feature.promotor.ui.search

import android.graphics.drawable.GradientDrawable
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.network.api.task.TaskTemplatesResp
import java.util.regex.Pattern

/**
 * Explore 搜索列表 Adapter，与 Web SearchPage searchScope=explore 样式一致。
 * 卡片：标题（高亮）、次使用/成功率/预计时间、右上角 App 图标。
 */
class SearchExploreAdapter(
    private val onTaskClick: (TaskTemplatesResp) -> Unit
) : RecyclerView.Adapter<SearchExploreAdapter.ViewHolder>() {

    var highlightKeyword: String = ""
    var items: List<TaskTemplatesResp> = emptyList()
        set(value) {
            field = value
            notifyDataSetChanged()
        }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_search_explore_result, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position], highlightKeyword, onTaskClick)
    }

    override fun getItemCount(): Int = items.size

    class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvTitle: TextView = itemView.findViewById(R.id.tv_title)
        private val tvUseCount: TextView = itemView.findViewById(R.id.tv_use_count)
        private val tvSuccessRate: TextView = itemView.findViewById(R.id.tv_success_rate)
        private val tvEstimatedTime: TextView = itemView.findViewById(R.id.tv_estimated_time)
        private val appIconWrapper: FrameLayout = itemView.findViewById(R.id.app_icon_wrapper)
        private val appIcon: TextView = itemView.findViewById(R.id.app_icon)

        fun bind(
            item: TaskTemplatesResp,
            keyword: String,
            onTaskClick: (TaskTemplatesResp) -> Unit
        ) {
            tvTitle.text = highlightKeyword(item.taskName, keyword)
            tvUseCount.text = "${item.totalExecutions + 175}次使用"
            val successRate = if (item.totalExecutions > 0) {
                if (item.successCount > 0) ((item.successCount * 100) / item.totalExecutions).toInt()
                else (75..98).random()
            } else 100
            tvSuccessRate.text = "$successRate% 成功率"
            tvEstimatedTime.text = "~3 min"

            val appName = item.relatedPlatforms.firstOrNull() ?: ""
            if (appName.isNotEmpty()) {
                appIconWrapper.visibility = View.VISIBLE
                appIcon.text = appName.take(2)
                val color = getAppColor(appName)
                val drawable = GradientDrawable().apply {
                    setColor(color)
                    cornerRadius = 12f * itemView.resources.displayMetrics.density
                }
                appIconWrapper.background = drawable
            } else {
                appIconWrapper.visibility = View.GONE
            }

            itemView.setOnClickListener { onTaskClick(item) }
        }

        private fun highlightKeyword(text: String, keyword: String): CharSequence {
            if (keyword.isBlank()) return text
            val escaped = Pattern.quote(keyword)
            val pattern = Pattern.compile(escaped, Pattern.CASE_INSENSITIVE)
            val matcher = pattern.matcher(text)
            val spannable = SpannableString(text)
            val color = ContextCompat.getColor(itemView.context, R.color.task_detail_edit_blue)
            while (matcher.find()) {
                spannable.setSpan(
                    ForegroundColorSpan(color),
                    matcher.start(),
                    matcher.end(),
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
            }
            return spannable
        }

        private fun getAppColor(appName: String): Int {
            val colorMap = mapOf(
                "小红书" to "#FF2442",
                "Xiaohongshu" to "#FF2442",
                "抖音" to "#000000",
                "TikTok" to "#000000",
                "微信" to "#07C160",
                "Twitter" to "#1DA1F2",
                "Mailchimp" to "#FFE01B",
                "LinkedIn" to "#0A66C2",
                "Google Ads" to "#4285F4",
                "Canva" to "#00C4CC",
                "Slack" to "#4A154B",
                "Pinterest" to "#E60023"
            )
            val hex = colorMap[appName] ?: "#2E58FF"
            return android.graphics.Color.parseColor(hex)
        }
    }
}
