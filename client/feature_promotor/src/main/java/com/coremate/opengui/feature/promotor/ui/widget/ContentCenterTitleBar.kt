package com.coremate.opengui.feature.promotor.ui.widget

import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.feature.promotor.databinding.ViewContentCenterTitleBarBinding

class ContentCenterTitleBar @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : LinearLayout(context, attrs, defStyleAttr) {

    private val binding: ViewContentCenterTitleBarBinding =
        ViewContentCenterTitleBarBinding.inflate(
            LayoutInflater.from(context),
            this,
            true
        )

    init {
        binding.vStatus.layoutParams.height = AMScreenUtils.getStatusBarHeight()
    }

    fun setTitle(title: String): ContentCenterTitleBar {
        binding.tvTitle.text = title
        return this
    }

    fun setBackground(r: Int ) {
        binding.llRoot.setBackgroundResource(r)
    }

    fun getMenu0Btn(): ImageView {
        return binding.imgMenu0;
    }

    fun getMoreBtn(): ImageView {
        return binding.imgMenu;
    }

    fun setLeftIconClickListener(listener: OnClickListener): ContentCenterTitleBar {
        binding.imgClose.setOnClickListener {
            listener.onClick(it)
        }
        return this
    }

    fun setRightIconClickListener(listener: OnClickListener): ContentCenterTitleBar {
        binding.imgMenu.setOnClickListener {
            listener.onClick(it)
        }
        return this
    }
}