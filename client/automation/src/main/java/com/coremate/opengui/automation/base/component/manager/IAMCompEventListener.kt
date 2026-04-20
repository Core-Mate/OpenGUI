package com.coremate.opengui.automation.base.component.manager

internal interface IAMCompEventListener {

    //开始
    fun onStartComp()

    //暂停
    fun onPauseComp()

    //结束
    fun onStopComp()

    //返回app
    fun onBackApp()


}
