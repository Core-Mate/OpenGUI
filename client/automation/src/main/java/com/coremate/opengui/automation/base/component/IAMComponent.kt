package com.coremate.opengui.automation.base.component

import com.coremate.opengui.automation.base.data.AMDataContainer


internal interface IAMComponent {

    /**
     * 初始化
     * */
    fun initUIAndData(dataContainer: AMDataContainer?)

    /**
     * 显示
     * */
    fun show()

    /**
     * 隐藏
     * */
    fun dismiss()

    /**
     * 设置隐藏自身
     * */
    fun setHiddenSelf()
}