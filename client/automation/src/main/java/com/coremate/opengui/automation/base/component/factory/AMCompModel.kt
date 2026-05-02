package com.coremate.opengui.automation.base.component.factory

import com.coremate.opengui.automation.base.component.IAMComponent
import kotlin.reflect.KClass

/**
 * Component model
 * */
internal class AMCompModel(val compCls: KClass<*>) {

    //Component instance
    var component: IAMComponent? = null

    //Show Hide
    private var isShow: Boolean = false

    //Whether it hid itself (marker)
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