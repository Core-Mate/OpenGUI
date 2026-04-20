package com.coremate.opengui.automation.base.component.factory

import com.coremate.opengui.automation.base.component.IAMComponent
import kotlin.reflect.KClass

/**
 * 组件模型
 * */
internal class AMCompModel(val compCls: KClass<*>) {

    //组件实例
    var component: IAMComponent? = null

    //显示隐藏
    private var isShow: Boolean = false

    //是否隐藏了自身(标识)
    private var isHiddenSelf = false

    fun changeShow(show: Boolean) {
        isShow = show
    }

    fun isShow() = isShow

    fun changeHiddenSelf(hidden: Boolean) {
        isHiddenSelf = hidden
    }

    fun isHiddenSelf() = isHiddenSelf

}