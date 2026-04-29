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

        searchContainer.visibility = View.VISIBLE
        searchContainer.alpha = 0f

        val layoutParams = searchContainer.layoutParams as ConstraintLayout.LayoutParams

        val originalWidth = layoutParams.width
        layoutParams.width = ConstraintLayout.LayoutParams.MATCH_PARENT
        searchContainer.layoutParams = layoutParams
        searchContainer.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        )
        val targetWidth = searchContainer.measuredWidth

        layoutParams.width = 0

        layoutParams.endToEnd = ConstraintLayout.LayoutParams.PARENT_ID
        layoutParams.startToStart = ConstraintLayout.LayoutParams.UNSET
        layoutParams.marginStart = width
        searchContainer.layoutParams = layoutParams
        searchContainer.requestLayout()

        searchContainer.post {

            val animator = ValueAnimator.ofInt(0, targetWidth)
            animator.duration = 300
            animator.addUpdateListener { animation ->
                val currentWidth = animation.animatedValue as Int
                layoutParams.width = currentWidth

                layoutParams.marginStart = width - currentWidth
                searchContainer.layoutParams = layoutParams

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

        if (searchContainer.visibility == View.GONE) {
            return
        }

        val layoutParams = searchContainer.layoutParams as ConstraintLayout.LayoutParams
        val currentWidth = searchContainer.width
        if (currentWidth <= 0) {

            searchContainer.visibility = View.GONE
            binding.titleContainer.visibility = View.VISIBLE
            return
        }

        val animator = ValueAnimator.ofInt(currentWidth, 0)
        animator.duration = 300
        animator.addUpdateListener { animation ->
            val width = animation.animatedValue as Int
            layoutParams.width = width

            layoutParams.marginStart = this@ContentStartBigTitleBar.width - width
            searchContainer.layoutParams = layoutParams

            val progress = width.toFloat() / currentWidth
            searchContainer.alpha = progress
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) {

                searchContainer.visibility = View.GONE
                binding.titleContainer.visibility = View.VISIBLE

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