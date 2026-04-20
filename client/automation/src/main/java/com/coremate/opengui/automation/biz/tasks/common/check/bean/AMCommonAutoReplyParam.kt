package com.coremate.opengui.automation.biz.tasks.common.check.bean

data class AMCommonAutoReplyParam(
    //结束时间
    var endTime: String? = null,
    //间隔多久切换平台监测(默认10分钟)
    var interval: Int = 10

)