package com.coremate.opengui.feature.promotor.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Spinner
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.coremate.opengui.feature.promotor.R // 确保导入正确的 R 文件
import com.coremate.opengui.feature.promotor.databinding.FragmentAiRoleSettingsBinding

class AiRoleSettingsFragment(private val containerId: Int = 0) : Fragment() {

    private var _binding: FragmentAiRoleSettingsBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        _binding = FragmentAiRoleSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 设置返回按钮的点击事件
        binding.ivBack.setOnClickListener {
            parentFragmentManager.popBackStack() // 返回上一个 Fragment (即 MeFragment)
        }

        // 初始化并设置 Spinner
        setupSpinner(binding.spinnerGender, R.array.ai_role_genders) { position ->
            val selectedGender = resources.getStringArray(R.array.ai_role_genders)[position]
            Toast.makeText(requireContext(), "选择性别: $selectedGender", Toast.LENGTH_SHORT).show()
            // 可以在这里保存选择
        }

        setupSpinner(binding.spinnerStyle, R.array.ai_role_styles) { position ->
            val selectedStyle = resources.getStringArray(R.array.ai_role_styles)[position]
            Toast.makeText(requireContext(), "选择风格: $selectedStyle", Toast.LENGTH_SHORT).show()
        }

        setupSpinner(binding.spinnerIndustry, R.array.ai_role_industries) { position ->
            val selectedIndustry = resources.getStringArray(R.array.ai_role_industries)[position]
            Toast.makeText(requireContext(), "选择行业: $selectedIndustry", Toast.LENGTH_SHORT).show()
        }

        // 设置知识库 EditText 的点击事件（模拟跳转到选择页面）
        binding.etKnowledgeBase.setOnClickListener {
            navigateToKnowledgeBaseSelection()
        }

        // 设置保存设置按钮的点击事件
        binding.btnSaveSettings.setOnClickListener {
            saveAiRoleSettings()
        }

        // TODO: 从数据源（如 ViewModel 或 API）加载现有设置，并填充到 UI 元素中
        loadAiRoleSettings()
    }

    private fun setupSpinner(spinner: Spinner, arrayResId: Int, onItemSelected: (Int) -> Unit) {
        val adapter = ArrayAdapter.createFromResource(
            requireContext(),
            arrayResId,
            android.R.layout.simple_spinner_item
        )
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter

        spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>, view: View?, position: Int, id: Long) {
                onItemSelected(position)
            }
            override fun onNothingSelected(parent: AdapterView<*>) {
                // Do nothing
            }
        }
    }

    private fun loadAiRoleSettings() {
        // TODO: 从 ViewModel 或 API 加载 AI 角色数据并填充 UI
        // 示例数据填充
        binding.etRoleName.setText("客服1号")
        binding.etPhoneNumber.setText("15874746969")
        binding.etKnowledgeBase.setText("美丽人生医美知识库")

        // 设置 Spinner 默认选中项（需要根据实际数据来确定索引）
        // 示例：将性别设置为“男”
        val genderArray = resources.getStringArray(R.array.ai_role_genders)
        val genderIndex = genderArray.indexOf("男") // 假设“男”在数组中
        if (genderIndex != -1) {
            binding.spinnerGender.setSelection(genderIndex)
        }

        // 示例：将风格设置为“自信幽默善解人意”
        val styleArray = resources.getStringArray(R.array.ai_role_styles)
        val styleIndex = styleArray.indexOf("自信幽默善解人意")
        if (styleIndex != -1) {
            binding.spinnerStyle.setSelection(styleIndex)
        }

        // 示例：将行业设置为“医疗美容”
        val industryArray = resources.getStringArray(R.array.ai_role_industries)
        val industryIndex = industryArray.indexOf("医疗美容")
        if (industryIndex != -1) {
            binding.spinnerIndustry.setSelection(industryIndex)
        }
    }

    private fun saveAiRoleSettings() {
        val roleName = binding.etRoleName.text.toString()
        val gender = binding.spinnerGender.selectedItem.toString()
        val style = binding.spinnerStyle.selectedItem.toString()
        val phoneNumber = binding.etPhoneNumber.text.toString()
        val industry = binding.spinnerIndustry.selectedItem.toString()
        val knowledgeBase = binding.etKnowledgeBase.text.toString()

        // TODO: 执行保存逻辑，例如发送到服务器或保存到本地数据库
        // 验证输入
        if (roleName.isBlank()) {
            Toast.makeText(requireContext(), "角色名不能为空", Toast.LENGTH_SHORT).show()
            return
        }
        if (phoneNumber.isBlank() || !isValidPhoneNumber(phoneNumber)) { // 假设你有一个 isValidPhoneNumber 函数
            Toast.makeText(requireContext(), "请输入有效的手机号", Toast.LENGTH_SHORT).show()
            return
        }

        Toast.makeText(requireContext(), "保存成功！角色名: $roleName, 手机号: $phoneNumber", Toast.LENGTH_LONG).show()
        // 保存成功后，可以返回上一个 Fragment
        // parentFragmentManager.popBackStack()
    }

    private fun isValidPhoneNumber(phoneNumber: String): Boolean {
        // 简单的手机号验证，实际应用中可能需要更复杂的正则
        return phoneNumber.length == 11 && phoneNumber.startsWith("1") && phoneNumber.all { it.isDigit() }
    }

    private fun navigateToKnowledgeBaseSelection() {
        if (containerId != 0) {
            parentFragmentManager.beginTransaction()
                .replace(containerId, KnowledgeBaseSelectionFragment(containerId)) // 传递 containerId
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