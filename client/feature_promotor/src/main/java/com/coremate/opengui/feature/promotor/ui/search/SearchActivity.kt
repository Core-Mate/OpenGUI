package com.coremate.opengui.feature.promotor.ui.search

import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.isGone
import androidx.core.view.isVisible
import androidx.recyclerview.widget.LinearLayoutManager
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.common.utils.KeyboardUtil
import com.coremate.opengui.feature.promotor.databinding.ActivitySearchBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.feature.promotor.ui.taskdetail.fragments.TaskDetailFragment
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.feature.promotor.ui.widget.FlowLayout
import com.coremate.opengui.network.api.task.TaskTemplatesResp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Explore 搜索页，与 Web SearchPage searchScope=explore 一致。
 * 数据：getTaskTemplatesResp；无关键词时展示历史记录、调用App、热门关键词。
 */
class SearchActivity :
    BaseBindingActivity<ActivitySearchBinding>(ActivitySearchBinding::inflate) {

    companion object {
        private const val PREFS_SEARCH_HISTORY = "search_explore"
        private const val KEY_HISTORY = "history"
        private const val MAX_HISTORY = 10
        private const val SHOW_HISTORY_COUNT = 3

        private val COMMON_APPS = listOf(
            Triple("xiaohongshu", "小红书", 0xFFFF2442.toInt()),
            Triple("douyin", "抖音", 0xFF000000.toInt()),
            Triple("wechat", "微信", 0xFF07C160.toInt())
        )
        private val HOT_KEYWORDS = listOf(
            "评论批量回复",
            "多平台同步发布",
            "群发消息",
            "关键词触发回复",
            "批量关注用户",
            "自动点赞评论"
        )
    }

    private var apiService: ApiService? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var allTasks: List<TaskTemplatesResp> = emptyList()
    private lateinit var adapter: SearchExploreAdapter
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
        setupCommonAppsAndHotKeywords()
        loadTasks()
        showEmptyPanelOrHide()
        binding.etSearchContent.postDelayed({
            binding.etSearchContent.requestFocus()
            (getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager)?.showSoftInput(binding.etSearchContent, 0)
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
                    showEmptyPanelOrHide()
                } else {
                    applyFilter(query)
                }
            }
        })

        binding.imgSearchClear.setOnClickListener {
            binding.etSearchContent.setText("")
            binding.imgSearchClear.isGone = true
            binding.tvSearchBtn.isGone = true
            showEmptyPanelOrHide()
        }

        binding.tvSearchBtn.setOnClickListener {
            KeyboardUtil.closeKeyboard(binding.etSearchContent)
            val term = binding.etSearchContent.text?.toString()?.trim() ?: ""
            if (term.isNotEmpty()) addSearchHistory(term)
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
        adapter = SearchExploreAdapter { task ->
            addSearchHistoryForCurrentQuery()
            val fragment = TaskDetailFragment.newInstance(task)
            fragment.show(supportFragmentManager, TaskDetailFragment::class.java.simpleName)
        }
        binding.rvResults.layoutManager = LinearLayoutManager(this, LinearLayoutManager.VERTICAL, false)
        binding.rvResults.adapter = adapter
        binding.rvResults.addItemDecoration(object : androidx.recyclerview.widget.RecyclerView.ItemDecoration() {
            override fun getItemOffsets(outRect: android.graphics.Rect, view: View, parent: androidx.recyclerview.widget.RecyclerView, state: androidx.recyclerview.widget.RecyclerView.State) {
                outRect.bottom = (12 * resources.displayMetrics.density).toInt()
            }
        })
    }

    private fun setupCommonAppsAndHotKeywords() {
        val dp16 = (16 * resources.displayMetrics.density).toInt()
        val dp12 = (12 * resources.displayMetrics.density).toInt()
        val dp8 = (8 * resources.displayMetrics.density).toInt()

        COMMON_APPS.forEach { (_, name, color) ->
            val wrap = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, 0, dp16, 0)
            }
            val sizePx = (56 * resources.displayMetrics.density).toInt()
            val iconBg = android.widget.FrameLayout(this).apply {
                layoutParams = LinearLayout.LayoutParams(sizePx, sizePx)
                setOnClickListener {
                    binding.etSearchContent.setText(name)
                    binding.etSearchContent.setSelection(name.length)
                    addSearchHistory(name)
                    applyFilter(name)
                }
            }
            val drawable = android.graphics.drawable.GradientDrawable().apply {
                setColor(color)
                cornerRadius = 18f * resources.displayMetrics.density
            }
            iconBg.background = drawable
            val label = TextView(this).apply {
                text = name.take(2)
                setTextColor(android.graphics.Color.WHITE)
                textSize = 13f
                gravity = android.view.Gravity.CENTER
                layoutParams = android.widget.FrameLayout.LayoutParams(
                    android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                    android.widget.FrameLayout.LayoutParams.MATCH_PARENT
                )
            }
            iconBg.addView(label)
            wrap.addView(iconBg)
            binding.containerCommonApps.addView(wrap)
        }

        (binding.containerHotKeywords as? FlowLayout)?.apply {
            horizontalSpacing = dp8
            verticalSpacing = dp8
        }
        HOT_KEYWORDS.forEach { keyword ->
            val chip = layoutInflater.inflate(android.R.layout.simple_list_item_1, binding.containerHotKeywords, false) as TextView
            chip.text = keyword
            chip.setPadding(dp16, dp12, dp16, dp12)
            chip.textSize = 14f
            chip.setTextColor(getColor(com.coremate.opengui.feature.promotor.R.color.task_detail_primary_text))
            chip.setBackgroundResource(com.coremate.opengui.feature.promotor.R.drawable.bg_white_circle)
            chip.layoutParams = ViewGroup.MarginLayoutParams(ViewGroup.MarginLayoutParams.WRAP_CONTENT, ViewGroup.MarginLayoutParams.WRAP_CONTENT)
            chip.setOnClickListener {
                binding.etSearchContent.setText(keyword)
                binding.etSearchContent.setSelection(keyword.length)
                addSearchHistory(keyword)
                applyFilter(keyword)
            }
            binding.containerHotKeywords.addView(chip)
        }
    }

    private fun loadTasks() {
        binding.panelLoading.isVisible = true
        binding.panelEmpty.isGone = true
        binding.rvResults.isGone = true
        binding.panelEmptyResult.isGone = true
        scope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.getTaskTemplatesResp()
            }.onSuccess { resp ->
                val list = resp?.body() ?: emptyList()
                runOnUiThread {
                    allTasks = list
                    binding.panelLoading.isGone = true
                    val query = binding.etSearchContent.text?.toString()?.trim() ?: ""
                    if (query.isEmpty()) {
                        showEmptyPanelOrHide()
                    } else {
                        applyFilter(query)
                    }
                }
            }.onFailure {
                it.printStackTrace()
                runOnUiThread {
                    allTasks = emptyList()
                    binding.panelLoading.isGone = true
                    showEmptyPanelOrHide()
                }
            }
        }
    }

    private fun applyFilter(query: String) {
        if (query.isEmpty()) {
            showEmptyPanelOrHide()
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
        binding.panelEmpty.isGone = true
        binding.rvResults.isVisible = filtered.isNotEmpty()
        binding.panelEmptyResult.isVisible = filtered.isEmpty()
    }

    private fun showEmptyPanelOrHide() {
        binding.panelLoading.isGone = true
        binding.rvResults.isGone = true
        binding.panelEmptyResult.isGone = true
        binding.panelEmpty.isVisible = true
        renderHistoryChips()
        binding.sectionHistory.isVisible = searchHistory.isNotEmpty()
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
            val chip = layoutInflater.inflate(android.R.layout.simple_list_item_1, binding.containerHistory, false) as TextView
            chip.text = term
            chip.setPadding(dp16, dp8, dp16, dp8)
            chip.textSize = 14f
            chip.setTextColor(getColor(com.coremate.opengui.feature.promotor.R.color.task_detail_primary_text))
            chip.setBackgroundResource(com.coremate.opengui.feature.promotor.R.drawable.bg_white_circle)
            chip.layoutParams = ViewGroup.MarginLayoutParams(ViewGroup.MarginLayoutParams.WRAP_CONTENT, ViewGroup.MarginLayoutParams.WRAP_CONTENT)
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
        if (searchHistory.size > MAX_HISTORY) searchHistory = searchHistory.take(MAX_HISTORY).toMutableList()
        saveSearchHistory()
        if (binding.panelEmpty.isVisible) renderHistoryChips()
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
}
