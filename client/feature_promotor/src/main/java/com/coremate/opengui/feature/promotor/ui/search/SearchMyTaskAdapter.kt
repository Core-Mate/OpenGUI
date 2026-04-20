package com.coremate.opengui.feature.promotor.ui.search

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
import com.coremate.opengui.common.utils.TimeUtils
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.network.api.task.TaskListRespItem
import java.util.regex.Pattern

class SearchMyTaskAdapter(
    private val onTaskClick: (TaskListRespItem) -> Unit,
    private val onRunTask: (TaskListRespItem) -> Unit
) : RecyclerView.Adapter<SearchMyTaskAdapter.ViewHolder>() {

    var highlightKeyword: String = ""
    var items: List<TaskListRespItem> = emptyList()
        set(value) {
            field = value
            notifyDataSetChanged()
        }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_search_my_task_result, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position], highlightKeyword, onTaskClick, onRunTask)
    }

    override fun getItemCount(): Int = items.size

    class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvTitle: TextView = itemView.findViewById(R.id.tv_title)
        private val tvSubtitle: TextView = itemView.findViewById(R.id.tv_subtitle)
        private val btnPlay: FrameLayout = itemView.findViewById(R.id.btn_play)

        fun bind(
            item: TaskListRespItem,
            keyword: String,
            onTaskClick: (TaskListRespItem) -> Unit,
            onRunTask: (TaskListRespItem) -> Unit
        ) {
            tvTitle.text = highlightKeyword(item.taskName, keyword)
            val appName = item.relatedPlatforms.firstOrNull() ?: ""
            val lastRun = try {
                item.lastExecution?.finishedAt?.let {
                    TimeUtils.convertUtcToBeijing(it)
                } ?: "从未运行"
            } catch (e: Exception) {
                "从未运行"
            }
            val createdAt = item.createdAt?.take(10) ?: ""
            tvSubtitle.text = if (lastRun == "从未运行") {
                if (createdAt.isNotEmpty()) "${appName.ifEmpty { "" } }${if (appName.isNotEmpty()) " • " else ""}${createdAt}创建"
                else "还没有执行过"
            } else {
                "${appName.ifEmpty { "" } }${if (appName.isNotEmpty()) " • " else ""}$lastRun"
            }

            itemView.setOnClickListener { onTaskClick(item) }
            btnPlay.setOnClickListener { onRunTask(item) }
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
    }
}
