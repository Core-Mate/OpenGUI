package com.coremate.opengui.feature.promotor.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.FragmentKnowledgeBaseSelectionBinding

class KnowledgeBaseSelectionFragment(private val containerId: Int = 0) : Fragment() {

    private var _binding: FragmentKnowledgeBaseSelectionBinding? = null
    private val binding get() = _binding!!


    private var selectedKnowledgeBase: String? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        _binding = FragmentKnowledgeBaseSelectionBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)


        binding.ivBack.setOnClickListener {
            parentFragmentManager.popBackStack()
        }


        binding.btnKnowledgeBase1.setOnClickListener {
            val name = binding.btnKnowledgeBase1.text.toString()
            selectedKnowledgeBase = name
            updateSelectionVisual(binding.btnKnowledgeBase1)
            navigateToKnowledgeBaseEdit(name, true)
        }

        binding.btnKnowledgeBase2.setOnClickListener {
            val name = binding.btnKnowledgeBase2.text.toString()
            selectedKnowledgeBase = name
            updateSelectionVisual(binding.btnKnowledgeBase2)
            navigateToKnowledgeBaseEdit(name, true)
        }


        binding.btnAddNewKnowledgeBase.setOnClickListener {
            selectedKnowledgeBase = null
            updateSelectionVisual(null)
            navigateToKnowledgeBaseEdit(null, false)
        }


        binding.btnSaveSettingsBottom.setOnClickListener {
            if (selectedKnowledgeBase != null) {

                parentFragmentManager.setFragmentResult(
                    "knowledge_base_selection_key",
                    Bundle().apply { putString("selected_knowledge_base", selectedKnowledgeBase) }
                )
                Toast.makeText(requireContext(), "Knowledge base settings saved", Toast.LENGTH_SHORT).show()
                parentFragmentManager.popBackStack()
            } else {
                Toast.makeText(requireContext(), "Select a knowledge base or create a new one.", Toast.LENGTH_SHORT).show()
            }
        }


        if (selectedKnowledgeBase != null) {


            // if (selectedKnowledgeBase == "Beauty Life medical aesthetics knowledge base") updateSelectionVisual(binding.btnKnowledgeBase1)
            // else if (selectedKnowledgeBase == "Digital Life E-commerce Knowledge Base") updateSelectionVisual(binding.btnKnowledgeBase2)
        }
    }


    private fun updateSelectionVisual(selectedButton: View?) {
        val buttons = listOf(binding.btnKnowledgeBase1, binding.btnKnowledgeBase2)
        for (button in buttons) {
            if (button == selectedButton) {
                button.setBackgroundResource(R.drawable.bg_knowledge_base_button_selected)
                button.setTextColor(resources.getColor(android.R.color.white, null))
            } else {
                button.setBackgroundResource(R.drawable.bg_knowledge_base_button_normal)
                button.setTextColor(resources.getColor(android.R.color.black, null))
            }
        }
    }

    private fun navigateToKnowledgeBaseEdit(name: String?, isEdit: Boolean) {
        if (containerId != 0) {
            val args = Bundle().apply {
                putBoolean(KnowledgeBaseEditFragment.ARG_IS_EDIT_MODE, isEdit)
                putString(KnowledgeBaseEditFragment.ARG_KNOWLEDGE_BASE_NAME, name)
            }
            val fragment = KnowledgeBaseEditFragment(containerId)
            fragment.arguments = args

            parentFragmentManager.beginTransaction()
                .replace(containerId, fragment)
                .addToBackStack(null)
                .commit()
        } else {
            Toast.makeText(requireContext(), "Navigation failed: container ID is not set.", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}