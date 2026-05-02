package com.coremate.opengui.automation.base.component

import com.coremate.opengui.automation.base.data.AMDataContainer


internal interface IAMComponent {

    /**
 * Initialize
     * */
    fun initUIAndData(dataContainer: AMDataContainer?)

    /**
 * Show
     * */
    fun show()

    /**
 * Hide
     * */
    fun dismiss()

    /**
 * Set self-hidden state
     * */
    fun setHiddenSelf()
}