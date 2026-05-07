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
import com.coremate.opengui.feature.promotor.ui.task.adapter.ExecutedTaskListAdapter
import com.coremate.opengui.feature.promotor.ui.widget.ContentStartBigTitleBar
import com.coremate.opengui.feature.promotor.util.GitHubStarHelper
import com.coremate.opengui.network.api.task.TaskListRespItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MyTaskFragment : Fragment() {

    private lateinit var binding: FragmentMyTaskBinding
    private lateinit var presenter: MyTaskPresenter
    private lateinit var taskListAdapter: ExecutedTaskListAdapter


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
        binding.layoutGithubStar.setOnClickListener {
            GitHubStarHelper.openRepository(requireContext())
        }
        binding.btnGithubStar.setOnClickListener {
            GitHubStarHelper.openRepository(requireContext())
        }

        binding.rvTaskList.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                super.onScrolled(recyclerView, dx, dy)
                val layoutManager = recyclerView.layoutManager as? LinearLayoutManager
                layoutManager?.let {
                    val visibleItemCount = it.childCount
                    val totalItemCount = it.itemCount
                    val firstVisibleItemPosition = it.findFirstVisibleItemPosition()


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
     */
    fun refreshData() {
        currentPage = 1
        hasMoreData = true
        isLoading = true
        presenter.getTasks(currentPage, pageSize, null, null, null, false)
    }

    /**
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


                hasMoreData = (data?.size ?: 0) >= pageSize
            }

            if (isLoadMore) {

                taskListAdapter.addData(data)
            } else {

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
