package com.coremate.opengui.feature.promotor.ui

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.text.TextUtils
import android.text.method.ScrollingMovementMethod
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.View.OnClickListener
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.RequiresApi
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.ui.views.DotsAnimationView
import com.coremate.opengui.feature.promotor.ui.views.NonTouchNestedScrollView
import com.coremate.opengui.feature.promotor.viewmodel.FinalStateEnum
import com.coremate.opengui.feature.promotor.viewmodel.MessageTypeEnum
import com.coremate.opengui.feature.promotor.viewmodel.UIMessageBean


@SuppressLint("NotifyDataSetChanged")
class ChatAdapter(private val itemLongClickListener: OnItemLongClickListener) :
    RecyclerView.Adapter<RecyclerView.ViewHolder>() {
    private var itemList: MutableList<UIMessageBean> = mutableListOf()



    private val VIEW_TYPE_SENT = 1
    private val VIEW_TYPE_RECEIVED = 2
    private val VIEW_TYPE_FOOTER = 3
    private val VIEW_TYPE_TIMESTAMP = 4

    override fun getItemViewType(position: Int): Int {
        val type = itemList[position].type
        if (type == MessageTypeEnum.USER) {
            return VIEW_TYPE_SENT
        } else if (type == MessageTypeEnum.SERVER) {
            return VIEW_TYPE_RECEIVED
        } else if (type == MessageTypeEnum.FOOTER) {
            return VIEW_TYPE_FOOTER
        } else {
            return VIEW_TYPE_TIMESTAMP
        }
    }

    override fun getItemCount(): Int {
        return itemList.size
    }


    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        if (viewType == VIEW_TYPE_SENT) {
            return UserSendViewHolder(
                LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_chat_message_sent, parent, false)
            )
        } else if (viewType == VIEW_TYPE_RECEIVED) {
            return ServerSendViewHolder(
                LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_chat_message_received, parent, false)
            )
        } else if (viewType == VIEW_TYPE_FOOTER) {
            return FooterViewHolder(
                LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_chat_footer, parent, false)
            )
        } else {
            return UserSendViewHolder(
                LayoutInflater.from(parent.context)
                    .inflate(R.layout.item_chat_timestamp, parent, false)
            )
        }
    }

    @RequiresApi(Build.VERSION_CODES.P)
    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (itemList[position].type) {
            MessageTypeEnum.USER -> {
                (holder as UserSendViewHolder).bind(itemList[position],itemLongClickListener)
            }

            MessageTypeEnum.SERVER -> {
                (holder as ServerSendViewHolder).bind(itemList[position]) {
                    notifyItemChanged(position)
                }
                var touchX = 0
                var touchY = 0
                holder.itemView.setOnTouchListener { v, event ->

                    if (event.action == MotionEvent.ACTION_DOWN) {
                        touchX = event.rawX.toInt()
                        touchY = event.rawY.toInt()
                    }

                    false
                }
                holder.itemView.setOnLongClickListener {

                    itemLongClickListener.onLongClick(it, itemList[position],itemList[position - 1].content, touchX, touchY)
                    true
                }
            }

            MessageTypeEnum.FOOTER -> {
                (holder as FooterViewHolder).bind()
            }

            MessageTypeEnum.TIMESTAMP -> {}
            null -> {}
        }
    }

    fun addHistoryMessage(historyMessages: List<UIMessageBean>) {
        itemList.addAll(historyMessages)
        itemList.add(UIMessageBean(null, "", MessageTypeEnum.FOOTER, null, ""))
        notifyDataSetChanged()
    }

    fun addNewMessage(chatMessages: UIMessageBean) {
        when (val size = itemList.size) {
            0 -> {
                itemList.add(chatMessages)
                itemList.add(UIMessageBean(null, "", MessageTypeEnum.FOOTER, null, ""))
                notifyDataSetChanged()
            }

            1 -> {
                itemList.add(0, chatMessages)
                notifyItemChanged(0)
            }

            else -> {
                val index = size - 1
                itemList.add(index, chatMessages)
                notifyItemChanged(itemList.size - 2)
            }
        }
    }

    fun updateLastChatMessageThought(content: String) {
        when (val size = itemList.size) {
            0 -> {
                return
            }

            1 -> {
                itemList[0].content += content
                notifyItemChanged(0)
            }

            else -> {
                val index = size - 2
                itemList[index].content += content
                notifyItemChanged(itemList.size - 2)
            }
        }
    }

    fun updateLastMessageSummary(content: String) {
        when (val size = itemList.size) {
            0 -> {
                return
            }

            1 -> {
                itemList[0].summary += content
                notifyItemChanged(0)
            }

            else -> {
                val index = size - 2
                itemList[index].summary += content
                notifyItemChanged(itemList.size - 2)
            }
        }
    }

    fun updateLastChatMessageFinalState(state: FinalStateEnum) {
        when (val size = itemList.size) {
            0 -> {
                return
            }

            1 -> {
                itemList[0].finalState = state
                notifyItemChanged(0)
            }

            else -> {
                val index = size - 2
                itemList[index].finalState = state
                notifyItemChanged(itemList.size - 2)
            }
        }
    }


    private class UserSendViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {

        private val textView: TextView = itemView.findViewById(R.id.tv_message_content)
        fun bind(item: UIMessageBean,itemLongClickListener: OnItemLongClickListener) {
            textView.text = item.content?.replaceFirst("\n", "")
            textView.movementMethod = ScrollingMovementMethod()

            var touchX = 0
            var touchY = 0
            textView.setOnTouchListener { v, event ->

                if (event.action == MotionEvent.ACTION_DOWN) {
                    touchX = event.rawX.toInt()
                    touchY = event.rawY.toInt()
                }

                false
            }
            textView.setOnLongClickListener {

                itemLongClickListener.onLongClick(it, item,item.content, touchX, touchY)
                true
            }

        }
    }

    private class ServerSendViewHolder(itemView: View) :
        RecyclerView.ViewHolder(itemView) {
        private val topThoughtStateWrap: LinearLayout =
            itemView.findViewById(R.id.top_thought_state_wrap)
        private val tvTopState: TextView = itemView.findViewById(R.id.tv_top_state)
        private val imgExpand: ImageView = itemView.findViewById(R.id.img_expand)
        private val tvThoughtContent: TextView = itemView.findViewById(R.id.tv_thought_content)
        private val tvSummary: TextView = itemView.findViewById(R.id.tv_summary)
        private val ivFinalResult: ImageView = itemView.findViewById(R.id.iv_final_result)
        private val tvFinalResult: TextView = itemView.findViewById(R.id.tv_final_result)
        private val loadingDotsView: DotsAnimationView =
            itemView.findViewById(R.id.iv_final_loading)
        private val scrollView: NonTouchNestedScrollView =
            itemView.findViewById(R.id.thought_scroll_view)
        private val root: LinearLayout =
            itemView.findViewById(R.id.root)

        fun bind(item: UIMessageBean, listener: OnClickListener) {
            if (topThoughtStateWrap.visibility == View.GONE && item.content.isNotEmpty()) {
                topThoughtStateWrap.visibility = View.VISIBLE
                scrollView.visibility = View.VISIBLE
            }
            tvThoughtContent.text = item.content
            if (item.isExpand) {
                imgExpand.setImageResource(R.drawable.icon_chat_message_expand)
                scrollView.maxHeightPx = Int.MAX_VALUE
            } else {
                imgExpand.setImageResource(R.drawable.icon_chat_message_contract)
                scrollView.maxHeightPx = dpToPx(200, itemView.context)
            }

            scrollView.requestLayout()
            if (!TextUtils.isEmpty(item.summary)) {
                tvSummary.visibility = View.VISIBLE
                tvSummary.text = item.summary
            } else {
                tvSummary.visibility = View.GONE
                tvSummary.text = ""
            }
            when (item.finalState) {
                FinalStateEnum.THINKING -> {
                    tvTopState.text = "Thinking"
                    ivFinalResult.visibility = View.GONE
                    tvFinalResult.visibility = View.GONE
                    loadingDotsView.visibility = View.VISIBLE
                }

                FinalStateEnum.THINK_SUCCESS -> {
                    tvTopState.text = "Thinking Completed"
                    ivFinalResult.visibility = View.GONE
                    tvFinalResult.visibility = View.GONE
                    loadingDotsView.visibility = View.VISIBLE
                }

                FinalStateEnum.TASK_SUCCESS -> {
                    tvTopState.text = "Thinking Completed"
                    ivFinalResult.visibility = View.VISIBLE
                    ivFinalResult.setImageResource(R.drawable.tool_action_completed)
                    tvFinalResult.visibility = View.VISIBLE
                    tvFinalResult.text = "Task completed"
                    loadingDotsView.visibility = View.GONE
                }

                FinalStateEnum.FAIL -> {
                    tvTopState.text = "Thinking Error"
                    ivFinalResult.visibility = View.VISIBLE
                    ivFinalResult.setImageResource(R.drawable.tool_action_fail)
                    tvFinalResult.visibility = View.VISIBLE
                    tvFinalResult.text = "Task Failed"
                    loadingDotsView.visibility = View.GONE
                }

                FinalStateEnum.INTERRUPT -> {
                    tvTopState.text = "Thinking Interrupted"
                    ivFinalResult.visibility = View.VISIBLE
                    ivFinalResult.setImageResource(R.drawable.tool_action_fail)
                    tvFinalResult.visibility = View.VISIBLE
                    tvFinalResult.text = "Task Interrupted"
                    loadingDotsView.visibility = View.GONE
                }

                null -> {}
            }
            scrollView.post {
                scrollView.fullScroll(View.FOCUS_DOWN)
            }
            topThoughtStateWrap.setOnClickListener {
                item.isExpand = !item.isExpand
                listener.onClick(it)
            }
        }

        private fun dpToPx(dp: Int, context: Context): Int {
            val density = context.resources.displayMetrics.density
            return (dp * density).toInt()
        }
    }

    private class FooterViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        fun bind() {}
    }

    interface OnItemLongClickListener {
        fun onLongClick(view: View, msg: UIMessageBean,prompt:String, x: Int, y: Int)
    }
}