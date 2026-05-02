package com.coremate.opengui.automation.biz.tasks.tk.bean

data class AMTkPublishParam(
    //Video topic
    var videoText: String? = null,
    //First N videos
    var videoCount: Int? = null,
    //Video length
    var videoLength: Int? = null,
    //Whether to use business info
    var isUseUserBg: Boolean? = null,
    //Your industry
    var industry: String? = null,
    //The product you sell
    var productCategory: String? = null,
    //Special qualities of the product you sell
    var productFeatures: String? = null,
    //Your target customer
    var targetCustomerGroup: String? = null, )