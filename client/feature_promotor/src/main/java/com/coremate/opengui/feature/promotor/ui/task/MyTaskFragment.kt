package com.coremate.opengui.feature.promotor.ui.task

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.OnBackPressedCallback
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.feature.promotor.databinding.FragmentMyTaskBinding
import com.coremate.opengui.feature.promotor.ui.widget.ContentStartBigTitleBar
import com.coremate.opengui.feature.promotor.ui.task.adapter.ExecutedTaskListAdapter
import com.coremate.opengui.network.api.task.TaskListRespItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MyTaskFragment : Fragment() {

    private lateinit var binding: FragmentMyTaskBinding
    private lateinit var presenter: MyTaskPresenter
    private lateinit var taskListAdapter: ExecutedTaskListAdapter

    // 分页相关变量
    private var currentPage = 1
    private val pageSize = 10
    private var isLoading = false
    private var hasMoreData = true
    private var isSearchMode = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentMyTaskBinding.inflate(inflater, container, false)
        presenter = MyTaskPresenter(this)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        taskListAdapter = ExecutedTaskListAdapter(fragmentManager, presenter)
        binding.rvTaskList.adapter = taskListAdapter;
        binding.rvTaskList.layoutManager = LinearLayoutManager(requireContext())
        // 添加滚动监听，实现分页加载
        binding.rvTaskList.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                super.onScrolled(recyclerView, dx, dy)
                val layoutManager = recyclerView.layoutManager as? LinearLayoutManager
                layoutManager?.let {
                    val visibleItemCount = it.childCount
                    val totalItemCount = it.itemCount
                    val firstVisibleItemPosition = it.findFirstVisibleItemPosition()

                    // 当滚动到接近底部时（剩余3个item时）加载下一页
                    if (!isLoading && hasMoreData) {
                        if (visibleItemCount + firstVisibleItemPosition >= totalItemCount - 3) {
                            loadMoreData()
                        }
                    }
                }
            }
        })

        binding.titlebar.setSearchActionCallback(object :
            ContentStartBigTitleBar.SearchActionCallback {
            override fun onSearch(content: String?) {
                if (content != null) {
                    presenter.searchTask(content)
                }
            }

            override fun exitSearchMode() {
                if (isSearchMode) {
                    isSearchMode = false
                    binding.titlebar.reset()
                    taskListAdapter.cancelSearchMode()
                }
            }

            override fun searchIconClick() {
                isSearchMode = true
            }
        })

        val callback = object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isSearchMode) {
                    isSearchMode = false
                    binding.titlebar.reset()
                    taskListAdapter.cancelSearchMode()
                }
            }
        };

        // 将回调添加到 Activity 的分发器中
        // 参数 1: LifecycleOwner (即 Fragment 本身)，确保生命周期感知
        requireActivity().onBackPressedDispatcher.addCallback(this, callback)

        lifecycleScope.launch {
            AutomationEventBus.events.collectLatest { event ->
                if (event == AutomationEvent.UpdateMyTask) {
                    refreshData()
                }
            }
        }
    }


    override fun onResume() {
        super.onResume()
        refreshData()
    }

    /**
     * 刷新数据，重置分页状态
     */
    fun refreshData() {
        currentPage = 1
        hasMoreData = true
        isLoading = true
        presenter.getTasks(currentPage, pageSize, null, null, null, false)
    }

    /**
     * 加载更多数据
     */
    private fun loadMoreData() {
        if (isLoading || !hasMoreData) {
            return
        }
        isLoading = true
        currentPage++
        if (isSearchMode) {

        } else {
            presenter.getTasks(currentPage, pageSize, null, null, null, true)
        }
    }

    fun updateTaskList(data: List<TaskListRespItem>?, isLoadMore: Boolean, isEmpty: Boolean) {
        lifecycleScope.launch(Dispatchers.Main) {
            isLoading = false
            if (isEmpty) {
                hasMoreData = false
            } else {
                // 如果返回的数据少于pageSize，说明没有更多数据了
                // 如果等于pageSize，可能还有更多数据，继续允许加载
                hasMoreData = (data?.size ?: 0) >= pageSize
            }

            if (isLoadMore) {
                // 加载更多时追加数据
                taskListAdapter.addData(data)
            } else {
                // 刷新时替换数据
                taskListAdapter.setData(data)
            }
        }
    }


    fun updateSearchResult(items: List<TaskListRespItem>?) {
        if (items != null && items.isNotEmpty()) {
            taskListAdapter.setSearchData(items)
            isSearchMode = true
        }
    }

}