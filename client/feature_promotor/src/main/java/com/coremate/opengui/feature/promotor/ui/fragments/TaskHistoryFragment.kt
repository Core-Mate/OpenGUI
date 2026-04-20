package com.coremate.opengui.feature.promotor.ui.fragments

import android.graphics.Color
import android.graphics.Rect
import android.os.Bundle
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
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
import com.coremate.opengui.feature.promotor.ui.fragments.presenter.TaskHistoryPresenter
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.FragmentTaskHistoryBinding
import com.coremate.opengui.feature.promotor.ui.taskdetail.adapter.TaskHistoryAdapter
import com.coremate.opengui.network.api.task.TaskHistoryResp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch


class TaskHistoryFragment : BottomSheetDialogFragment() {
    private var taskHistoryListAdapter: TaskHistoryAdapter? = null
    private lateinit var binding: FragmentTaskHistoryBinding
    private lateinit var presenter: TaskHistoryPresenter
    private var id: Int? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, R.style.BottomSheetDialog)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentTaskHistoryBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 获取传递的参数
        arguments?.getInt(ARG_TASK_ID)?.let { id ->
            this.id = id
        }
        presenter = TaskHistoryPresenter(this)
        //        任务历史列表
        binding.rvTaskHistoryList.isNestedScrollingEnabled = false
        taskHistoryListAdapter = TaskHistoryAdapter(fragmentManager)
        binding.rvTaskHistoryList.adapter = taskHistoryListAdapter
        binding.rvTaskHistoryList.layoutManager =
            LinearLayoutManager(requireContext(), LinearLayoutManager.VERTICAL, false)
        binding.rvTaskHistoryList.addItemDecoration(object : RecyclerView.ItemDecoration() {
            override fun getItemOffsets(
                outRect: Rect,
                view: View,
                parent: RecyclerView,
                state: RecyclerView.State
            ) {
                super.getItemOffsets(outRect, view, parent, state)
                outRect.top = 12.dpToPx(requireContext())
            }
        })
        // 处理 RecyclerView 与 BottomSheet 的滑动冲突
        binding.rvTaskHistoryList.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                    // 禁用 BottomSheet 的滑动
                    v.parent?.requestDisallowInterceptTouchEvent(true)
                }

                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    // 允许 BottomSheet 继续处理触摸事件
                    v.parent?.requestDisallowInterceptTouchEvent(false)
                }
            }
            false
        }
        binding.imgClose.setOnClickListener{
            dismiss()
        }
        presenter.getTaskHistory(this.id)
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
                peekHeight = 730.dpToPx(requireContext())
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
                    // 禁止通过手指下滑关闭对话框
                    behavior.isDraggable = false
                }
            }
        }
    }

    fun updateHistoryList(data: TaskHistoryResp?) {
        lifecycleScope.launch(Dispatchers.Main) {
        taskHistoryListAdapter?.setData(data?.items) }
    }

    companion object {
        const val ARG_TASK_ID = "task_id"
        fun newInstance(id: Long? = null): TaskHistoryFragment {
            return TaskHistoryFragment().apply {
                arguments = Bundle().apply {
                    id?.let {
                        putLong(ARG_TASK_ID, it)
                    }
                }
            }
        }
    }
}


