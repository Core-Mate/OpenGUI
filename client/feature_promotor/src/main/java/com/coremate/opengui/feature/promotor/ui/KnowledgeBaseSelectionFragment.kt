package com.coremate.opengui.feature.promotor.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.coremate.opengui.feature.promotor.R // 确保导入正确的 R 文件
import com.coremate.opengui.feature.promotor.databinding.FragmentKnowledgeBaseSelectionBinding

class KnowledgeBaseSelectionFragment(private val containerId: Int = 0) : Fragment() {

    private var _binding: FragmentKnowledgeBaseSelectionBinding? = null
    private val binding get() = _binding!!

    // 用于存储当前选中的知识库名称，以便保存后返回时更新上一个页面
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

        // 设置返回按钮的点击事件
        binding.ivBack.setOnClickListener {
            parentFragmentManager.popBackStack() // 返回上一个 Fragment
        }

        // 知识库按钮的点击事件，导航到编辑页面
        binding.btnKnowledgeBase1.setOnClickListener {
            val name = binding.btnKnowledgeBase1.text.toString()
            selectedKnowledgeBase = name
            updateSelectionVisual(binding.btnKnowledgeBase1)
            navigateToKnowledgeBaseEdit(name, true) // 编辑模式
        }

        binding.btnKnowledgeBase2.setOnClickListener {
            val name = binding.btnKnowledgeBase2.text.toString()
            selectedKnowledgeBase = name
            updateSelectionVisual(binding.btnKnowledgeBase2)
            navigateToKnowledgeBaseEdit(name, true) // 编辑模式
        }

        // 新增知识库按钮的点击事件
        binding.btnAddNewKnowledgeBase.setOnClickListener {
            selectedKnowledgeBase = null // 清除选中状态
            updateSelectionVisual(null) // 清除所有按钮的选中视觉状态
            navigateToKnowledgeBaseEdit(null, false) // 新增模式
        }

        // 保存设置按钮的点击事件
        binding.btnSaveSettingsBottom.setOnClickListener {
            if (selectedKnowledgeBase != null) {
                // 将选中的知识库名称传回给 AiRoleSettingsFragment
                parentFragmentManager.setFragmentResult(
                    "knowledge_base_selection_key",
                    Bundle().apply { putString("selected_knowledge_base", selectedKnowledgeBase) }
                )
                Toast.makeText(requireContext(), "知识库设置已保存", Toast.LENGTH_SHORT).show()
                parentFragmentManager.popBackStack() // 返回上一个 Fragment
            } else {
                Toast.makeText(requireContext(), "请选择一个知识库或新增", Toast.LENGTH_SHORT).show()
            }
        }

        // 首次加载时，如果有默认选中项，更新视觉
        if (selectedKnowledgeBase != null) {
            // 这里需要根据 selectedKnowledgeBase 的值来判断是哪个按钮并更新
            // 比如，可以从 arguments 中获取传递过来的 initialSelectedKnowledgeBaseName
            // if (selectedKnowledgeBase == "美丽人生医美知识库") updateSelectionVisual(binding.btnKnowledgeBase1)
            // else if (selectedKnowledgeBase == "数字人生电商知识库") updateSelectionVisual(binding.btnKnowledgeBase2)
        }
    }

    // 辅助函数：更新按钮选中状态的视觉效果
    private fun updateSelectionVisual(selectedButton: View?) {
        val buttons = listOf(binding.btnKnowledgeBase1, binding.btnKnowledgeBase2) // 如果有更多，添加到这里
        for (button in buttons) {
            if (button == selectedButton) {
                button.setBackgroundResource(R.drawable.bg_knowledge_base_button_selected) // 选中状态
                button.setTextColor(resources.getColor(android.R.color.white, null))
            } else {
                button.setBackgroundResource(R.drawable.bg_knowledge_base_button_normal) // 正常状态
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
            Toast.makeText(requireContext(), "导航失败：容器ID未设置", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}