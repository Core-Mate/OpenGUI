package com.coremate.opengui.feature.promotor.ui.widget

import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.widget.LinearLayout
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.ViewContentStartSearchTitleBarBinding


class ContentStartSearchTitleBar @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : LinearLayout(context, attrs, defStyleAttr) {

    private var searchActionCallback: SearchActionCallback? = null
    private var searchActionInPage = false

    private val binding: ViewContentStartSearchTitleBarBinding =
        ViewContentStartSearchTitleBarBinding.inflate(
            LayoutInflater.from(context),
            this,
            true
        )

    init {

        attrs?.let {
            val typedArray = context.obtainStyledAttributes(it, R.styleable.ContentStartTitleBar)
            searchActionInPage =
                typedArray.getBoolean(R.styleable.ContentStartTitleBar_searchActionInPage, true)
            typedArray.recycle()
        }
        binding.searchContainer.setOnClickListener {
            searchActionCallback?.searchIconClick()
        }
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