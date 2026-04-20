package com.coremate.opengui.automation.biz.tasks.tk.bean

data class AMTkPublishParam(
    //视频主题
    var videoText: String? = null,
    //前几个视频
    var videoCount: Int? = null,
    //视频长度
    var videoLength: Int? = null,
    //是否使用业务信息
    var isUseUserBg: Boolean? = null,
    //你所属的行业
    var industry: String? = null,
    //您销售的产品
    var productCategory: String? = null,
    //您销售的产品特别
    var productFeatures: String? = null,
    //您的目标客户
    var targetCustomerGroup: String? = null, )