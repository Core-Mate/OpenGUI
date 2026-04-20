package com.coremate.opengui.feature.promotor.ui.taskdetail.fragments

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.WindowCompat
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.FragmentTaskDetailBinding
import com.coremate.opengui.feature.promotor.ui.taskdetail.TaskDetailActivity
import com.coremate.opengui.feature.promotor.ui.taskdetail.TaskDetailPresenter
import com.coremate.opengui.network.api.task.TaskListRespItem
import com.coremate.opengui.network.api.task.TaskTemplatesResp

class TaskDetailFragment : BottomSheetDialogFragment() {

    private lateinit var binding: FragmentTaskDetailBinding
    private var item: TaskTemplatesResp? = null
    var presenter: TaskDetailPresenter? = null


    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, R.style.BottomSheetDialog)
        item = arguments?.getSerializable(ARG_ITEM) as? TaskTemplatesResp
        presenter = context?.let { TaskDetailPresenter(it) }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentTaskDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.imgClose.setOnClickListener {
            dismiss()
        }

        binding.tvAdd.setOnClickListener {
            context?.let { it1 ->
                presenter?.saveTask(
                    it1,
                    item?.taskName,
                    item?.taskDescription, { it ->
                        if (it) {
                            dismiss()
                            val data = TaskListRespItem(
                                item?.id ?: 0,
                                item?.userID ?: 0,
                                item?.taskName ?: "",
                                item?.taskDescription ?: "",
                                item?.relatedPlatforms ?: listOf(),
                                item?.category ?: "",
                                item?.totalExecutions ?: 0,
                                item?.successCount ?: 0,
                                item?.failCount ?: 0,
                                item?.createdAt ?: "",
                                item?.updatedAt ?: "",
                                null
                            )
                            val intent = Intent(context, TaskDetailActivity::class.java)
                            intent.putExtra("data", data)
                            context?.startActivity(intent)
                        }
                    }
                )
            }
        }

        item?.let { bindItem(it) }
    }

    private fun bindItem(data: TaskTemplatesResp) {
        binding.tvDetailTitle.text = data.taskName
        binding.tvDetailDescription.text = data.taskDescription

        val usageCount = "${data.totalExecutions}"
        binding.tvUsageCount.text = usageCount
        val successRate = data.totalExecutions.let {
            if (it > 0) {
                (75..98).random()
            } else {
                100
            }
        }
        binding.tvSuccessRate.text = "${successRate}%"

        binding.tvEstimatedTime.text = "~10min"
    }

    override fun onStart() {
        super.onStart()
        val bottomSheet =
            dialog?.findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)
        if (bottomSheet != null) {
            val params = bottomSheet.layoutParams as CoordinatorLayout.LayoutParams
            params.width = FrameLayout.LayoutParams.MATCH_PARENT
            params.height = FrameLayout.LayoutParams.WRAP_CONTENT
            bottomSheet.layoutParams = params
            BottomSheetBehavior.from(bottomSheet)
        }

        if (dialog != null) {
            val window = dialog!!.window
            if (window != null) {
                window.setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                            WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
                )
                WindowCompat.setDecorFitsSystemWindows(window, false)
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
                window.setStatusBarColor(Color.TRANSPARENT)
            }

            if (dialog is BottomSheetDialog) {
                val sheet = (dialog as BottomSheetDialog)
                    .findViewById<View?>(com.google.android.material.R.id.design_bottom_sheet)
                if (sheet != null) {
                    val behavior = BottomSheetBehavior.from<View?>(sheet)
                    behavior.skipCollapsed = true
                    behavior.state = BottomSheetBehavior.STATE_EXPANDED
                    behavior.isDraggable = false
                }
            }
        }
    }

    companion object {
        private const val ARG_ITEM = "arg_item"

        fun newInstance(item: TaskTemplatesResp): TaskDetailFragment {
            return TaskDetailFragment().apply {
                arguments = Bundle().apply {
                    putSerializable(ARG_ITEM, item)
                }
            }
        }
    }
}
