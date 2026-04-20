package com.coremate.opengui.feature.promotor.ui.widget

import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.content.Context.INPUT_METHOD_SERVICE
import android.content.Intent
import android.text.TextUtils
import android.util.AttributeSet
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.constraintlayout.widget.ConstraintLayout
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.ViewContentStartBigTitleBarBinding
import com.coremate.opengui.feature.promotor.ui.mine.setting.SettingActivity
import com.coremate.opengui.feature.promotor.ui.search.SearchMyTaskActivity


class ContentStartBigTitleBar @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : LinearLayout(context, attrs, defStyleAttr) {

    private var searchActionCallback: SearchActionCallback? = null
    private var searchActionInPage = false

    private val binding: ViewContentStartBigTitleBarBinding =
        ViewContentStartBigTitleBarBinding.inflate(
            LayoutInflater.from(context),
            this,
            true
        )

    init {
        // 读取自定义属性
        attrs?.let {
            val typedArray = context.obtainStyledAttributes(it, R.styleable.ContentStartTitleBar)
            val title = typedArray.getString(R.styleable.ContentStartTitleBar_title)
            searchActionInPage =
                typedArray.getBoolean(R.styleable.ContentStartTitleBar_searchActionInPage, true)
            title?.let { titleText ->
                setTitle(titleText)
            }
            typedArray.recycle()
        }
        binding.imgSearch.setOnClickListener {
            val intent = Intent(getContext(), SearchMyTaskActivity::class.java)
            getContext().startActivity(intent)
        }

        binding.imgSettings.setOnClickListener {
            val intent = Intent(getContext(), SettingActivity::class.java)
            getContext().startActivity(intent)
        }

        binding.etSearchContent.setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) {
                binding.etSearchContent.setBackgroundResource(R.drawable.search_white_bg_border)
            } else {
                binding.etSearchContent.setBackgroundResource(R.drawable.search_white_bg)
            }
        }


        binding.tvCancel.setOnClickListener {
            hideSearchWidget()
            searchActionCallback?.exitSearchMode()
        }
        binding.etSearchContent.setOnEditorActionListener(object : TextView.OnEditorActionListener {
            override fun onEditorAction(
                p0: TextView?,
                p1: Int,
                p2: KeyEvent?
            ): Boolean {
                runCatching {
                    if (p1 == EditorInfo.IME_ACTION_SEARCH) {
                        val imm =
                            context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager?
                        imm?.hideSoftInputFromWindow(binding.etSearchContent.windowToken, 0)
                        if (TextUtils.isEmpty(binding.etSearchContent.text)) {
                            searchActionCallback?.onSearch(null)
                        } else {
                            searchActionCallback?.onSearch(binding.etSearchContent.text.toString())
                        }
                        return true
                    }
                    return false
                }.onFailure {
                    it.printStackTrace()
                }
                return return false
            }
        })
    }

    fun setTitle(title: String) {
        binding.tvTitle.text = title
    }

    fun showSearchWidget() {
        val searchContainer = binding.searchContainer
        // 先设置为可见
        searchContainer.visibility = View.VISIBLE
        searchContainer.alpha = 0f
        // 先让容器完全展开以测量目标宽度
        val layoutParams = searchContainer.layoutParams as ConstraintLayout.LayoutParams
        // 临时设置为 match_parent 来测量完整宽度
        val originalWidth = layoutParams.width
        layoutParams.width = ConstraintLayout.LayoutParams.MATCH_PARENT
        searchContainer.layoutParams = layoutParams
        searchContainer.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        )
        val targetWidth = searchContainer.measuredWidth
        // 设置初始状态：宽度为0，右边固定（通过 endToEnd 约束）
        layoutParams.width = 0
        // 确保右边固定，左边可以自由移动
        layoutParams.endToEnd = ConstraintLayout.LayoutParams.PARENT_ID
        layoutParams.startToStart = ConstraintLayout.LayoutParams.UNSET
        layoutParams.marginStart = width // 初始左边距使视图在右边
        searchContainer.layoutParams = layoutParams
        searchContainer.requestLayout()
        // 等待布局完成后再开始动画
        searchContainer.post {
            // 创建宽度动画
            val animator = ValueAnimator.ofInt(0, targetWidth)
            animator.duration = 300 // 动画时长300ms
            animator.addUpdateListener { animation ->
                val currentWidth = animation.animatedValue as Int
                layoutParams.width = currentWidth
                // 从右边展开到左边：调整左边距使内容从右向左展开
                layoutParams.marginStart = width - currentWidth
                searchContainer.layoutParams = layoutParams
                // 同时淡入效果
                val progress = currentWidth.toFloat() / targetWidth
                searchContainer.alpha = progress
            }
            postDelayed({
                binding.etSearchContent.requestFocus()
                val imm = context.getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager?
                imm?.showSoftInput(binding.etSearchContent, 0)
            }, 200)
            animator.start()
        }
    }

    fun hideSearchWidget() {
        val searchContainer = binding.searchContainer
        // 如果已经隐藏，直接返回
        if (searchContainer.visibility == View.GONE) {
            return
        }
        // 获取当前宽度
        val layoutParams = searchContainer.layoutParams as ConstraintLayout.LayoutParams
        val currentWidth = searchContainer.width
        if (currentWidth <= 0) {
            // 如果宽度为0，直接隐藏
            searchContainer.visibility = View.GONE
            binding.titleContainer.visibility = View.VISIBLE
            return
        }
        // 创建宽度动画：从当前宽度到0
        val animator = ValueAnimator.ofInt(currentWidth, 0)
        animator.duration = 300 // 动画时长300ms
        animator.addUpdateListener { animation ->
            val width = animation.animatedValue as Int
            layoutParams.width = width
            // 从左边收缩到右边：调整左边距使内容从左向右收缩
            layoutParams.marginStart = this@ContentStartBigTitleBar.width - width
            searchContainer.layoutParams = layoutParams
            // 同时淡出效果
            val progress = width.toFloat() / currentWidth
            searchContainer.alpha = progress
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) {
                // 动画结束后隐藏搜索容器，显示标题容器
                searchContainer.visibility = View.GONE
                binding.titleContainer.visibility = View.VISIBLE
                // 重置状态
                searchContainer.alpha = 1f
            }
        })
        animator.start()
        val imm = context.getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager?
        imm?.hideSoftInputFromWindow(binding.etSearchContent.windowToken, 0)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        reset()
    }

    fun reset() {
        hideSearchWidget()
        binding.etSearchContent.text = null
    }

    fun setSearchActionCallback(callback: SearchActionCallback) {
        this.searchActionCallback = callback
    }

    public interface SearchActionCallback {
        fun onSearch(content: String?)
        fun exitSearchMode()

        fun searchIconClick()
    }
}