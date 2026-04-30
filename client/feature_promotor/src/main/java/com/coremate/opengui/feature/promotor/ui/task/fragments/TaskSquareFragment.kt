package com.coremate.opengui.feature.promotor.ui.task.fragments

import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.coremate.opengui.common.utils.dpToPx
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.common.bean.TaskCategoryBean
import com.coremate.opengui.feature.promotor.databinding.FragmentTaskSquareBinding
import com.coremate.opengui.feature.promotor.ui.task.adapter.TaskSheetCategoryListAdapter
import com.coremate.opengui.feature.promotor.ui.task.adapter.TaskSheetListAdapter
import com.coremate.opengui.feature.promotor.ui.task.adapter.TaskSheetListAdapterListener
import com.coremate.opengui.feature.promotor.ui.task.fragments.presenter.TaskSquarePresenter
import com.coremate.opengui.feature.promotor.ui.taskdetail.fragments.TaskDetailFragment
import com.coremate.opengui.network.api.task.TaskTemplatesResp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch


class TaskSquareFragment : BottomSheetDialogFragment(), TaskSheetListAdapterListener {

    private var taskCategoryListAdapter: TaskSheetCategoryListAdapter? = null
    private var taskListAdapter: TaskSheetListAdapter? = null
    private lateinit var binding: FragmentTaskSquareBinding
    private lateinit var presenter: TaskSquarePresenter
    private var allTaskList: List<TaskTemplatesResp> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, R.style.BottomSheetDialog)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentTaskSquareBinding.inflate(inflater, container, false)
        presenter = TaskSquarePresenter(this)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.etSearchContent.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                binding.clSearchBg.setBackgroundResource(R.drawable.bg_gray_circle_border)
            } else {
                binding.clSearchBg.setBackgroundResource(R.drawable.bg_gray_circle)
            }
        }


        binding.etSearchContent.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val query = s?.toString()?.trim() ?: ""
                binding.imgSearchClear.visibility = if (query.isEmpty()) View.GONE else View.VISIBLE
                applySearchFilter(query)
            }
        })

        binding.etSearchContent.setOnEditorActionListener { v, actionId, event ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH ||
                (event?.keyCode == KeyEvent.KEYCODE_ENTER
                        && event.action == KeyEvent.ACTION_DOWN)
            ) {
                val imm = v.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                imm.hideSoftInputFromWindow(v.windowToken, 0)
                true
            } else {
                false
            }
        }


        binding.imgSearchClear.setOnClickListener {
            binding.etSearchContent.setText("")
            binding.imgSearchClear.visibility = View.GONE
            taskListAdapter?.setData(allTaskList)
        }

//        Task categories
        taskCategoryListAdapter = TaskSheetCategoryListAdapter()
        binding.rvTaskCategoryList.adapter = taskCategoryListAdapter
        binding.rvTaskCategoryList.layoutManager =
            LinearLayoutManager(requireContext(), LinearLayoutManager.HORIZONTAL, false)
        binding.rvTaskCategoryList.addItemDecoration(object : RecyclerView.ItemDecoration() {
            override fun getItemOffsets(
                outRect: Rect,
                view: View,
                parent: RecyclerView,
                state: RecyclerView.State
            ) {
                super.getItemOffsets(outRect, view, parent, state)
                outRect.right = 12.dpToPx(requireContext())
            }
        })


        binding.rvTaskList.isNestedScrollingEnabled = false
        taskListAdapter = TaskSheetListAdapter(fragmentManager)
        taskListAdapter?.listener = this
        binding.rvTaskList.adapter = taskListAdapter
        binding.rvTaskList.layoutManager =
            LinearLayoutManager(requireContext(), LinearLayoutManager.VERTICAL, false)
        binding.rvTaskList.addItemDecoration(object : RecyclerView.ItemDecoration() {
            override fun getItemOffsets(
                outRect: Rect,
                view: View,
                parent: RecyclerView,
                state: RecyclerView.State
            ) {
                super.getItemOffsets(outRect, view, parent, state)
                outRect.bottom = 12.dpToPx(requireContext())
            }
        })


        binding.rvTaskList.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {

                    v.parent?.requestDisallowInterceptTouchEvent(true)
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {

                    v.parent?.requestDisallowInterceptTouchEvent(false)
                }
            }
            false
        }
        binding.imgClose.setOnClickListener {
            dismiss()
        }
        initTaskData()
        presenter.getTaskTemplates()
    }


    override fun onStart() {
        super.onStart()
        val bottomSheet =
            dialog?.findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)
        if (bottomSheet != null) {
            val params = bottomSheet.layoutParams as CoordinatorLayout.LayoutParams
            params.width = FrameLayout.LayoutParams.MATCH_PARENT
            params.height = FrameLayout.LayoutParams.MATCH_PARENT
            bottomSheet.layoutParams = params
            val behavior = BottomSheetBehavior.from(bottomSheet).apply {
                isFitToContents = false
                peekHeight = 630.dpToPx(requireContext())
            }
        }

        if (dialog != null) {
            val window = dialog!!.window
            if (window != null) {
                window.setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                            WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
                )

                // Make dialog window layout fullscreen so the dim covers status bar
                WindowCompat.setDecorFitsSystemWindows(window, false)
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
                window.setStatusBarColor(Color.TRANSPARENT)
                window.setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }

            if (dialog is BottomSheetDialog) {
                val dialog = dialog as BottomSheetDialog?
                val bottomSheet =
                    dialog!!.findViewById<View?>(com.google.android.material.R.id.design_bottom_sheet)
                if (bottomSheet != null) {
                    val behavior = BottomSheetBehavior.from<View?>(bottomSheet)
                    behavior.skipCollapsed = true
                    behavior.setState(BottomSheetBehavior.STATE_EXPANDED)

                    behavior.isDraggable = false
                }
            }
        }
    }

    fun updateTaskList(data: List<TaskTemplatesResp>?) {
        lifecycleScope.launch(Dispatchers.Main) {
            allTaskList = data.orEmpty()
            val query = binding.etSearchContent.text?.toString()?.trim() ?: ""
            if (query.isEmpty()) {
                taskListAdapter?.setData(allTaskList)
            } else {
                applySearchFilter(query)
            }
        }
    }

    private fun applySearchFilter(query: String) {
        if (query.isEmpty()) {
            taskListAdapter?.setData(allTaskList)
            return
        }
        val filtered = allTaskList.filter {
            it.taskName?.contains(query, ignoreCase = true) == true
        }
        taskListAdapter?.setData(filtered)
    }

    override fun onClickItem(item: TaskTemplatesResp) {
        dismiss()
        val bottomSheetDialog = TaskDetailFragment.newInstance(item)
        activity?.let {
            bottomSheetDialog.show(
                it.supportFragmentManager,
                TaskDetailFragment::class.java.simpleName
            )
        }
    }

    fun initTaskData() {
        val data: MutableList<TaskCategoryBean> = mutableListOf()
        val bean3 = TaskCategoryBean(true, R.drawable.icon_reply, "Comment Replies")
        val bean4 = TaskCategoryBean(false, R.drawable.icon_messages, "Message Engagement")
        val bean1 = TaskCategoryBean(false, R.drawable.icon_pic, "Publish Content")
        val bean2 = TaskCategoryBean(false, R.drawable.icon_film, "Industry Research")
        data.add(bean3)
        data.add(bean4)
        data.add(bean1)
        data.add(bean2)
        taskCategoryListAdapter?.setData(data)
    }

}


