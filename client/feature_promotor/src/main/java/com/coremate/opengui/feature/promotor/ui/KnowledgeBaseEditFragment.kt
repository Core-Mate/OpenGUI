package com.coremate.opengui.feature.promotor.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import com.coremate.opengui.feature.promotor.databinding.FragmentKnowledgeBaseEditBinding


data class KnowledgeDocument(val name: String)


data class QaPair(val id: Int, var question: String, var answer: String)

class KnowledgeBaseEditFragment(private val containerId: Int = 0) : Fragment() {

    private var _binding: FragmentKnowledgeBaseEditBinding? = null
    private val binding get() = _binding!!


    private lateinit var qaAdapter: QaPairAdapter
    private val qaList = mutableListOf<QaPair>()
    private var nextQaId = 3


    private var isEditMode: Boolean = false
    private var currentKnowledgeBaseName: String? = null

    companion object {
        const val ARG_IS_EDIT_MODE = "is_edit_mode"
        const val ARG_KNOWLEDGE_BASE_NAME = "knowledge_base_name"

    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        arguments?.let {
            isEditMode = it.getBoolean(ARG_IS_EDIT_MODE, false)
            currentKnowledgeBaseName = it.getString(ARG_KNOWLEDGE_BASE_NAME)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        _binding = FragmentKnowledgeBaseEditBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)


        binding.tvTitle.text = if (isEditMode) "EditKnowledge Base" else "New knowledge base"


        binding.ivBack.setOnClickListener {
            parentFragmentManager.popBackStack()
        }


        qaAdapter = QaPairAdapter(qaList)
        binding.rvQaPairs.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = qaAdapter
            isNestedScrollingEnabled = false
        }


        if (isEditMode && currentKnowledgeBaseName != null) {
            loadKnowledgeBaseData(currentKnowledgeBaseName!!)
        } else {

        }


        binding.btnUploadDocument.setOnClickListener {
            Toast.makeText(requireContext(), "Document upload is not implemented yet", Toast.LENGTH_SHORT).show()

        }


        binding.btnAddNewQaPair.setOnClickListener {
            addNewQaPair()
        }


        binding.btnSaveKnowledgeBase.setOnClickListener {
            saveKnowledgeBase()
        }
    }

    private fun loadKnowledgeBaseData(name: String) {
        binding.etKnowledgeBaseName.setText(name)



        binding.tvDocument1.text = "Product Knowledge Document 01"
        binding.tvDocument2.text = "Product Sales Knowledge Document 02"
        binding.tvDocument1.visibility = View.VISIBLE
        binding.tvDocument2.visibility = View.VISIBLE



        qaList.clear()
        if (name == "Beauty Life medical aesthetics knowledge base") {
            qaList.add(QaPair(1, "I want a refund", "Sorry, refunds are not supported yet."))
            qaList.add(QaPair(2, "Where is your factory?", "Our factory is in Guangdong, with a complete supply chain and reliable quality."))
        } else if (name == "Digital Life E-commerce Knowledge Base") {
            qaList.add(QaPair(1, "How do I check order status?", "Check it under Profile - My Orders."))
            qaList.add(QaPair(2, "When will the product ship?", "Usually within 24 hours after payment."))
        }
        qaAdapter.notifyDataSetChanged()
    }

    private fun addNewQaPair() {
        qaList.add(QaPair(nextQaId++, "", "")) // Add an empty Q&A pair for the user to fill in.
        qaAdapter.notifyItemInserted(qaList.size - 1)

        binding.rvQaPairs.post {
            binding.rvQaPairs.scrollToPosition(qaList.size - 1)
        }
    }

    private fun saveKnowledgeBase() {
        val name = binding.etKnowledgeBaseName.text.toString().trim()
        if (name.isBlank()) {
            Toast.makeText(requireContext(), "Knowledge Base Name cannot be empty", Toast.LENGTH_SHORT).show()
            return
        }




        Toast.makeText(requireContext(), "Knowledge Base '$name' saved", Toast.LENGTH_SHORT).show()



        parentFragmentManager.setFragmentResult(
            "knowledge_base_edit_key",
            Bundle().apply { putString("updated_knowledge_base_name", name) }
        )
        parentFragmentManager.popBackStack()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
