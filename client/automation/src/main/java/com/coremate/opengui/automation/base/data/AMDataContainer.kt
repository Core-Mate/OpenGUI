package com.coremate.opengui.automation.base.data

import com.coremate.opengui.automation.biz.type.AMTaskBizType

data class AMDataContainer(val bizType: AMTaskBizType? = null, var bean: Any? = null) {

    //Extra info
    var extra: Any? = null


    fun withExtra(data: Any?) = apply {
        extra = data
    }


}
