package com.coremate.opengui.automation.biz.tasks.common.check.bean

data class AMCommonAutoReplyParam(
    //End time
    var endTime: String? = null,
    //Interval duration Switch-platform monitor, default 10 minutes
    var interval: Int = 10

)