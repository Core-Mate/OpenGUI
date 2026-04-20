package com.coremate.opengui.feature.promotor.ui.explore

import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.common.utils.dpToPx
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.common.bean.TaskCategoryBean
import com.coremate.opengui.feature.promotor.databinding.FragmentSearchBinding
import com.coremate.opengui.feature.promotor.ui.explore.adapter.TaskCategoryListAdapter
import com.coremate.opengui.feature.promotor.ui.explore.adapter.TaskListAdapter
import com.coremate.opengui.feature.promotor.ui.explore.adapter.TaskListAdapterListener
import com.coremate.opengui.feature.promotor.ui.search.SearchActivity
import com.coremate.opengui.feature.promotor.ui.widget.ContentStartSearchTitleBar
import com.coremate.opengui.feature.promotor.ui.explore.adapter.RecommendListAdapter
import com.coremate.opengui.feature.promotor.ui.taskdetail.fragments.TaskDetailFragment
import com.coremate.opengui.network.api.task.TaskTemplatesResp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ExploreFragment : Fragment(), TaskListAdapterListener {
    private lateinit var binding: FragmentSearchBinding
    private val recommendListAdapter = RecommendListAdapter()
    private var taskCategoryListAdapter: TaskCategoryListAdapter? = null
    private var taskListAdapter: TaskListAdapter? = null
    private lateinit var presenter: TaskSearchPresenter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentSearchBinding.inflate(inflater, container, false)
        presenter = TaskSearchPresenter(this)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        recommendListAdapter.listener = this
        binding.rvRecommendList.adapter = recommendListAdapter
        binding.rvRecommendList.layoutManager =
            LinearLayoutManager(requireContext(), LinearLayoutManager.HORIZONTAL, false)
        binding.rvRecommendList.addItemDecoration(object : RecyclerView.ItemDecoration() {
            override fun getItemOffsets(
                outRect: Rect,
                view: View,
                parent: RecyclerView,
                state: RecyclerView.State
            ) {
                super.getItemOffsets(outRect, view, parent, state)
                outRect.right = 4.dpToPx(requireContext())
            }
        })
//        任务分类
        taskCategoryListAdapter = TaskCategoryListAdapter()
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
        //        任务列表
        binding.rvTaskList.isNestedScrollingEnabled = false
        taskListAdapter = TaskListAdapter(fragmentManager)
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

                val position = parent.getChildAdapterPosition(view)
                if (position == 0) {
                    outRect.top = 12.dpToPx(requireContext())
                } else {
                    outRect.top = 2.dpToPx(requireContext())
                }
                if (position == (taskListAdapter?.itemCount ?: 0) - 1) {
                    outRect.bottom = AMScreenUtils.dp2px(156f)
                }
            }
        })


        initTaskData()
        presenter.getTaskTemplates()

        binding.titlebar.setSearchActionCallback(object :
            ContentStartSearchTitleBar.SearchActionCallback {
            override fun onSearch(content: String?) {
            }

            override fun exitSearchMode() {
            }

            override fun searchIconClick() {
                val intent = Intent(requireContext(), SearchActivity::class.java)
                startActivity(intent)
            }
        })
    }

    fun updateTaskList(data: List<TaskTemplatesResp>?) {
        lifecycleScope.launch(Dispatchers.Main) {
            taskListAdapter?.setData(data)
            recommendListAdapter.setData(data)
        }
    }

    fun initTaskData() {
        val data: MutableList<TaskCategoryBean> = mutableListOf()
        val bean3 = TaskCategoryBean(true, R.drawable.ic_grid, "全部")
        val bean4 = TaskCategoryBean(false, R.drawable.ic_share, "发布内容")
        val bean1 = TaskCategoryBean(false, R.drawable.ic_video, "制作视频")
        val bean2 = TaskCategoryBean(false, R.drawable.ic_message, "营销活动")
        data.add(bean3)
        data.add(bean4)
        data.add(bean1)
        data.add(bean2)
        taskCategoryListAdapter?.setData(data)
    }

    override fun onClickItem(item: TaskTemplatesResp) {
        val bottomSheetDialog = TaskDetailFragment.newInstance(item)
        activity?.let {
            bottomSheetDialog.show(
                it.supportFragmentManager,
                TaskDetailFragment::class.java.simpleName
            )
        }
    }


}