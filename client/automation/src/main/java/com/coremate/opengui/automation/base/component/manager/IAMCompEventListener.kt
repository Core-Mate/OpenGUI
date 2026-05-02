package com.coremate.opengui.automation.base.component.manager

internal interface IAMCompEventListener {

    //Start
    fun onStartComp()

    //Pause
    fun onPauseComp()

    //End
    fun onStopComp()

    //Return to app
    fun onBackApp()


}
