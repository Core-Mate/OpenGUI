package com.coremate.opengui.feature.promotor.ui.search

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.core.view.isGone
import androidx.core.view.isVisible
import androidx.recyclerview.widget.LinearLayoutManager
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.databinding.ActivitySearchMyTaskBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.feature.promotor.ui.execute.PromptExecutionActivity
import com.coremate.opengui.feature.promotor.ui.taskdetail.TaskDetailActivity
import com.coremate.opengui.feature.promotor.ui.views.PermissionDialogItem
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.task.TaskListRespItem
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import android.graphics.drawable.BitmapDrawable
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.view.ViewGroup
import android.widget.LinearLayout
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.common.utils.KeyboardUtil
import com.coremate.opengui.feature.promotor.PermissionManager
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.ui.widget.FlowLayout

class SearchMyTaskActivity :
    BaseBindingActivity<ActivitySearchMyTaskBinding>(ActivitySearchMyTaskBinding::inflate) {

    companion object {
        private const val PREFS_SEARCH_HISTORY = "search_my_task"
        private const val KEY_HISTORY = "history"
        private const val MAX_HISTORY = 10
        private const val SHOW_HISTORY_COUNT = 3
    }

    private var apiService: ApiService? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var allTasks: List<TaskListRespItem> = emptyList()
    private lateinit var adapter: SearchMyTaskAdapter
    private var searchHistory: MutableList<String> = mutableListOf()

    override fun initParam() {
        apiService = RetrofitClient.create(this)
        loadSearchHistory()
    }

    override fun initView() {
        binding.vStatus.layoutParams.height = AMScreenUtils.getStatusBarHeight()
        binding.tvCancel.setOnClickListener { finish() }
        setupSearchBar()
        setupResultsList()
        loadTasks()
        showHistoryOrHideContent()

        binding.etSearchContent.postDelayed({
            binding.etSearchContent.requestFocus()
            (getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager)?.showSoftInput(
                binding.etSearchContent,
                0
            )
        }, 200)
    }

    override fun initEvent() {}

    private fun setupSearchBar() {

        binding.etSearchContent.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val hasText = !s.isNullOrBlank()
                binding.imgSearchClear.isVisible = hasText
                binding.tvSearchBtn.isVisible = hasText
                val query = s?.toString()?.trim() ?: ""
                if (query.isEmpty()) {
                    showHistoryOrHideContent()
                } else {
                    applyFilter(query)
                }
            }
        })

        binding.imgSearchClear.setOnClickListener {
            binding.etSearchContent.setText("")
            binding.imgSearchClear.isGone = true
            binding.tvSearchBtn.isGone = true
            showHistoryOrHideContent()
        }

        binding.tvSearchBtn.setOnClickListener {
            KeyboardUtil.closeKeyboard(binding.etSearchContent)
            val term = binding.etSearchContent.text?.toString()?.trim() ?: ""
            if (term.isNotEmpty()) {
                addSearchHistory(term)
            }
        }

        binding.etSearchContent.setOnEditorActionListener { v, actionId, event ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH ||
                (event?.keyCode == KeyEvent.KEYCODE_ENTER
                        && event.action == KeyEvent.ACTION_DOWN)
            ) {
                val term = binding.etSearchContent.text?.toString()?.trim() ?: ""
                if (term.isNotEmpty()) {
                    addSearchHistory(term)
                    KeyboardUtil.closeKeyboard(binding.etSearchContent)
                }
                val imm =
                    v.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                imm.hideSoftInputFromWindow(v.windowToken, 0)
                true
            } else {
                false
            }
        }

    }

    private fun setupResultsList() {
        adapter = SearchMyTaskAdapter(
            onTaskClick = { task ->
                KeyboardUtil.closeKeyboard(binding.etSearchContent)
                addSearchHistoryForCurrentQuery()
                val intent = Intent(this, TaskDetailActivity::class.java)
                intent.putExtra("data", task)
                startActivity(intent)
            },
            onRunTask = { task ->
                KeyboardUtil.closeKeyboard(binding.etSearchContent)
                addSearchHistoryForCurrentQuery()
                runTask(task)
            }
        )
        binding.rvResults.layoutManager =
            LinearLayoutManager(this, LinearLayoutManager.VERTICAL, false)
        binding.rvResults.adapter = adapter
        binding.rvResults.addItemDecoration(object :
            androidx.recyclerview.widget.RecyclerView.ItemDecoration() {
            override fun getItemOffsets(
                outRect: android.graphics.Rect,
                view: View,
                parent: androidx.recyclerview.widget.RecyclerView,
                state: androidx.recyclerview.widget.RecyclerView.State
            ) {
                outRect.bottom = (12 * resources.displayMetrics.density).toInt()
            }
        })
    }

    private fun loadTasks() {
        binding.panelLoading.isVisible = true
        binding.panelHistory.isGone = true
        binding.rvResults.isGone = true
        binding.panelEmptyResult.isGone = true
        scope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.getMyTask(1, 200, null, null, null)
            }.onSuccess { resp ->
                val list = resp?.body()?.items ?: emptyList()
                runOnUiThread {
                    allTasks = list
                    binding.panelLoading.isGone = true
                    val query = binding.etSearchContent.text?.toString()?.trim() ?: ""
                    if (query.isEmpty()) {
                        showHistoryOrHideContent()
                    } else {
                        applyFilter(query)
                    }
                }
            }.onFailure {
                it.printStackTrace()
                runOnUiThread {
                    allTasks = emptyList()
                    binding.panelLoading.isGone = true
                    showHistoryOrHideContent()
                }
            }
        }
    }

    private fun applyFilter(query: String) {
        if (query.isEmpty()) {
            showHistoryOrHideContent()
            return
        }
        adapter.highlightKeyword = query
        val q = query.lowercase()
        val filtered = allTasks.filter { task ->
            task.taskName.lowercase().contains(q) ||
                    task.taskDescription.lowercase().contains(q) ||
                    task.relatedPlatforms.any { it.lowercase().contains(q) }
        }
        adapter.items = filtered
        binding.panelLoading.isGone = true
        binding.panelHistory.isGone = true
        binding.rvResults.isVisible = filtered.isNotEmpty()
        binding.panelEmptyResult.isVisible = filtered.isEmpty()
    }

    private fun showHistoryOrHideContent() {
        binding.panelLoading.isGone = true
        binding.rvResults.isGone = true
        binding.panelEmptyResult.isGone = true
        if (searchHistory.isEmpty()) {
            binding.panelHistory.isGone = true
        } else {
            binding.panelHistory.isVisible = true
            renderHistoryChips()
        }
    }

    private fun renderHistoryChips() {
        binding.containerHistory.removeAllViews()
        val dp8 = (8 * resources.displayMetrics.density).toInt()
        val dp16 = (16 * resources.displayMetrics.density).toInt()
        (binding.containerHistory as? FlowLayout)?.apply {
            horizontalSpacing = dp8
            verticalSpacing = dp8
        }
        searchHistory.take(SHOW_HISTORY_COUNT).forEach { term ->
            val chip = layoutInflater.inflate(
                android.R.layout.simple_list_item_1,
                binding.containerHistory,
                false
            ) as TextView
            chip.text = term
            chip.setPadding(dp16, dp8, dp16, dp8)
            chip.textSize = 14f
            chip.setTextColor(getColor(R.color.task_detail_primary_text))
            chip.setBackgroundResource(R.drawable.bg_white_circle)
            chip.layoutParams = ViewGroup.MarginLayoutParams(
                ViewGroup.MarginLayoutParams.WRAP_CONTENT,
                ViewGroup.MarginLayoutParams.WRAP_CONTENT
            )
            chip.setOnClickListener {
                binding.etSearchContent.setText(term)
                binding.etSearchContent.setSelection(term.length)
                applyFilter(term)
            }
            binding.containerHistory.addView(chip)
        }
    }

    private fun addSearchHistory(term: String) {
        if (term.isBlank()) return
        searchHistory.remove(term)
        searchHistory.add(0, term)
        if (searchHistory.size > MAX_HISTORY) searchHistory =
            searchHistory.take(MAX_HISTORY).toMutableList()
        saveSearchHistory()
        if (binding.panelHistory.isVisible) renderHistoryChips()
    }

    private fun loadSearchHistory() {
        val prefs = getSharedPreferences(PREFS_SEARCH_HISTORY, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_HISTORY, null) ?: return
        searchHistory = raw.split("\n").map { it.trim() }.filter { it.isNotEmpty() }.toMutableList()
    }

    private fun saveSearchHistory() {
        getSharedPreferences(PREFS_SEARCH_HISTORY, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_HISTORY, searchHistory.joinToString("\n"))
            .apply()
    }

    fun addSearchHistoryForCurrentQuery() {
        val term = binding.etSearchContent.text?.toString()?.trim() ?: return
        if (term.isNotEmpty()) addSearchHistory(term)
    }

    private fun runTask(task: TaskListRespItem) {
        if (!PermissionManager.checkPermission(this,"SearchMyTaskActivity - runTask")) {
            PermissionManager.showRequestPermissionWindow(this)
            return
        }
        TaskCenter.reset(this@SearchMyTaskActivity,"SearchMy Tasks - Run")
        TaskCenter.taskId = task.id
        TaskCenter.taskTitle = task.taskName
        TaskCenter.taskPrompt = task.taskDescription
        val intent = Intent(this, PromptExecutionActivity::class.java)
        intent.putExtra("prompt", task.taskDescription.trim())
        intent.putExtra("taskId", task.id)
        startActivity(intent)
    }
}
