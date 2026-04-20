package com.coremate.opengui.feature.promotor.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.databinding.FragmentAiSuggestionsBinding
import com.coremate.opengui.feature.promotor.databinding.ItemSuggestionButtonBinding

class AISuggestionsFragment : Fragment() {

    private var _binding: FragmentAiSuggestionsBinding? = null
    private val binding get() = _binding!!

    // 定义建议数据类
    data class Suggestion(val id: String, val text: String)

    // Adapter 及其点击监听器接口
    interface OnSuggestionClickListener {
        // 修改为只传递文本，不自动发送
        fun onSuggestionClick(suggestionText: String)
    }

    private var onSuggestionClickListener: OnSuggestionClickListener? = null

    // 设置点击监听器的方法
    fun setOnSuggestionClickListener(listener: OnSuggestionClickListener) {
        this.onSuggestionClickListener = listener
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAiSuggestionsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 初始化 RecyclerView
        val suggestionsAdapter = SuggestionsAdapter { suggestion ->
            // 1. 通过接口回调，将建议文本传递给 AITaskFragment
            onSuggestionClickListener?.onSuggestionClick(suggestion.text)
            // 2. 关闭建议页面
            parentFragmentManager.popBackStack() // 或 remove 这个 Fragment
        }

        binding.rvSuggestionsList.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = suggestionsAdapter
        }

        // 填充建议数据
        val suggestions = listOf(
            Suggestion("1", "帮我打开今日头条"),
            Suggestion("2", "给小红书账号发布一篇文章"),
            Suggestion("3", "帮我打开闲鱼"),
            Suggestion("4", "帮我打开微信"), // 示例
            Suggestion("5", "查询天气预报")   // 示例
        )
        suggestionsAdapter.submitList(suggestions)

        // 关闭按钮点击事件
        binding.btnCloseSuggestions.setOnClickListener {
            parentFragmentManager.popBackStack() // 关闭当前 Fragment
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    // RecyclerView Adapter
    class SuggestionsAdapter(private val onSuggestionClick: (Suggestion) -> Unit) :
        ListAdapter<Suggestion, SuggestionsAdapter.SuggestionViewHolder>(SuggestionDiffCallback()) {

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): SuggestionViewHolder {
            val binding = ItemSuggestionButtonBinding.inflate(
                LayoutInflater.from(parent.context), parent, false
            )
            return SuggestionViewHolder(binding)
        }

        override fun onBindViewHolder(holder: SuggestionViewHolder, position: Int) {
            val suggestion = getItem(position)
            holder.bind(suggestion, onSuggestionClick)
        }

        class SuggestionViewHolder(private val binding: ItemSuggestionButtonBinding) :
            RecyclerView.ViewHolder(binding.root) {
            fun bind(suggestion: Suggestion, onSuggestionClick: (Suggestion) -> Unit) {
                binding.btnSuggestion.text = suggestion.text
                binding.btnSuggestion.setOnClickListener {
                    onSuggestionClick(suggestion)
                }
            }
        }

        private class SuggestionDiffCallback : DiffUtil.ItemCallback<Suggestion>() {
            override fun areItemsTheSame(oldItem: Suggestion, newItem: Suggestion): Boolean {
                return oldItem.id == newItem.id
            }

            override fun areContentsTheSame(oldItem: Suggestion, newItem: Suggestion): Boolean {
                return oldItem == newItem
            }
        }
    }
}