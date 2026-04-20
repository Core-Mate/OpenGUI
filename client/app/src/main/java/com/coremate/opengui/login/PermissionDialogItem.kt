package com.coremate.opengui.login

import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.widget.LinearLayout
import android.widget.TextView
import com.coremate.opengui.R

class PermissionDialogItem : LinearLayout {
    constructor(context: Context) : this(context, null)
    constructor(context: Context, attrs: AttributeSet?) : this(context, attrs, 0)
    constructor(context: Context, attrs: AttributeSet?, defStyleAttr: Int) : super(
        context,
        attrs,
        defStyleAttr
    ) {
        //因为我们引入的布局文件根布局是merge，而我们的CustomViewGroup又是继承LinearLayout，所以我们在这里设置几个属性
        this.orientation = HORIZONTAL
        init()
    }

    private var tvTitle: TextView? = null
    private var tvSetPermission: TextView? = null
    private var l: OnClickListener? = null

    fun init() {
        val inflate =
            LayoutInflater.from(context).inflate(R.layout.view_permission_dialog_item, this)
        tvTitle = inflate.findViewById(R.id.tv_title)
        tvSetPermission = inflate.findViewById(R.id.tv_set_permission)
        tvSetPermission?.setOnClickListener {
            l?.onClick(it)
        }
    }

    fun setTitle(title: String) {
        tvTitle?.text = title
    }

    fun setOnTextClickListener(l: OnClickListener?) {
        this.l = l
    }
}