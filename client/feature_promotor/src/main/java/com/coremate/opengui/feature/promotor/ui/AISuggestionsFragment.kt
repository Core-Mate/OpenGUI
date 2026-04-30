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


    data class Suggestion(val id: String, val text: String)


    interface OnSuggestionClickListener {

        fun onSuggestionClick(suggestionText: String)
    }

    private var onSuggestionClickListener: OnSuggestionClickListener? = null


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


        val suggestionsAdapter = SuggestionsAdapter { suggestion ->

            onSuggestionClickListener?.onSuggestionClick(suggestion.text)

            parentFragmentManager.popBackStack()
        }

        binding.rvSuggestionsList.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = suggestionsAdapter
        }


        val suggestions = listOf(
            Suggestion("1", "Open Toutiao"),
            Suggestion("2", "Publish an article to a Xiaohongshu account"),
            Suggestion("3", "Open Xianyu"),
            Suggestion("4", "Open WeChat"), // Example.
            Suggestion("5", "Check the weather forecast")   // Example.
        )
        suggestionsAdapter.submitList(suggestions)


        binding.btnCloseSuggestions.setOnClickListener {
            parentFragmentManager.popBackStack()
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
