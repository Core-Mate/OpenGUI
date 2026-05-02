package com.coremate.opengui.automation.base.component.factory

import com.coremate.opengui.automation.AMServiceManager
import com.coremate.opengui.automation.base.component.AMBaseFloatWindow
import com.coremate.opengui.automation.base.component.IAMComponent
import com.coremate.opengui.automation.base.component.manager.IAMCompEventListener
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.data.AMDataContainer

/// impl
internal class AMFloatFactory {

    fun create(
        model: AMCompModel,
        amContext: AMContext,
        dataContainer: AMDataContainer?,
        listener: IAMCompEventListener?
    ): IAMComponent = (model.compCls.constructors.first()
        .call(AMServiceManager.applicationContext) as AMBaseFloatWindow<*, *>).apply {
        //Set initial data
        this.curModel = model
        this.amContext = amContext
        this.listener = listener
    }.apply {
        //Set drag behavior
        setDragMoveSelf()
    }.apply {
        //Start loading UI and data
        initUIAndData(dataContainer)
    }

}