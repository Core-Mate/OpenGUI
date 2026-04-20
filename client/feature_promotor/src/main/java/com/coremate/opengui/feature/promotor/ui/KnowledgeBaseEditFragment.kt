package com.coremate.opengui.feature.promotor.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import com.coremate.opengui.feature.promotor.databinding.FragmentKnowledgeBaseEditBinding

// 数据类，用于模拟知识库文档
data class KnowledgeDocument(val name: String)

// 数据类，用于模拟问答对
data class QaPair(val id: Int, var question: String, var answer: String)

class KnowledgeBaseEditFragment(private val containerId: Int = 0) : Fragment() {

    private var _binding: FragmentKnowledgeBaseEditBinding? = null
    private val binding get() = _binding!!

    // 适配器和数据列表用于问答对
    private lateinit var qaAdapter: QaPairAdapter
    private val qaList = mutableListOf<QaPair>()
    private var nextQaId = 3 // 用于模拟问答对的ID

    // 存储当前是编辑模式还是新增模式
    private var isEditMode: Boolean = false
    private var currentKnowledgeBaseName: String? = null

    companion object {
        const val ARG_IS_EDIT_MODE = "is_edit_mode"
        const val ARG_KNOWLEDGE_BASE_NAME = "knowledge_base_name"
        // 可以添加更多参数来传递文档和问答对的初始数据
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

        // 设置顶部标题
        binding.tvTitle.text = if (isEditMode) "编辑知识库" else "新增知识库"

        // 设置返回按钮的点击事件
        binding.ivBack.setOnClickListener {
            parentFragmentManager.popBackStack()
        }

        // 初始化问答对 RecyclerView
        qaAdapter = QaPairAdapter(qaList)
        binding.rvQaPairs.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = qaAdapter
            isNestedScrollingEnabled = false // 防止ScrollView和RecyclerView的滚动冲突
        }

        // 根据模式加载数据
        if (isEditMode && currentKnowledgeBaseName != null) {
            loadKnowledgeBaseData(currentKnowledgeBaseName!!)
        } else {
            // 新增模式，可以预填充一些默认值或留空
        }

        // 上传文档按钮点击事件
        binding.btnUploadDocument.setOnClickListener {
            Toast.makeText(requireContext(), "上传文档功能待实现", Toast.LENGTH_SHORT).show()
            // TODO: 实现文档上传逻辑，例如打开文件选择器
        }

        // 新增问答对按钮点击事件
        binding.btnAddNewQaPair.setOnClickListener {
            addNewQaPair()
        }

        // 保存知识库按钮点击事件
        binding.btnSaveKnowledgeBase.setOnClickListener {
            saveKnowledgeBase()
        }
    }

    private fun loadKnowledgeBaseData(name: String) {
        binding.etKnowledgeBaseName.setText(name)

        // 模拟文档数据（这里直接更新TextView，实际可能更复杂）
        // 如果文档是动态列表，这里需要动态添加View或使用RecyclerView
        binding.tvDocument1.text = "产品知识文档01"
        binding.tvDocument2.text = "产品销售知识文档02"
        binding.tvDocument1.visibility = View.VISIBLE
        binding.tvDocument2.visibility = View.VISIBLE


        // 模拟问答对数据
        qaList.clear()
        if (name == "美丽人生医美知识库") {
            qaList.add(QaPair(1, "我想要退款", "抱歉，平台暂时不支持退款！"))
            qaList.add(QaPair(2, "你们工厂在哪", "我们的工厂在广东这边，上下游有完整的产业链，质量绝对有保障"))
        } else if (name == "数字人生电商知识库") {
            qaList.add(QaPair(1, "怎么查看订单状态", "请在个人中心-我的订单中查看。"))
            qaList.add(QaPair(2, "商品何时发货", "一般在支付成功后24小时内发货。"))
        }
        qaAdapter.notifyDataSetChanged()
    }

    private fun addNewQaPair() {
        qaList.add(QaPair(nextQaId++, "", "")) // 添加空的问答对，待用户填写
        qaAdapter.notifyItemInserted(qaList.size - 1)
        // 滚动到新添加的问答对，以便用户立即编辑
        binding.rvQaPairs.post {
            binding.rvQaPairs.scrollToPosition(qaList.size - 1)
        }
    }

    private fun saveKnowledgeBase() {
        val name = binding.etKnowledgeBaseName.text.toString().trim()
        if (name.isBlank()) {
            Toast.makeText(requireContext(), "知识库名称不能为空", Toast.LENGTH_SHORT).show()
            return
        }

        // TODO: 获取所有文档和问答对的数据
        // 遍历 qaList，获取用户输入的问题和答案
        // 实际保存逻辑（例如发送到API）
        Toast.makeText(requireContext(), "知识库 '$name' 已保存", Toast.LENGTH_SHORT).show()

        // 保存成功后，将数据传回 KnowledgeBaseSelectionFragment
        // 这里只传回名称，实际可能传回更复杂的对象或ID
        parentFragmentManager.setFragmentResult(
            "knowledge_base_edit_key",
            Bundle().apply { putString("updated_knowledge_base_name", name) }
        )
        parentFragmentManager.popBackStack() // 返回上一个 Fragment
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}