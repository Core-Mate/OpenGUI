package com.coremate.opengui.automation.biz.common.node

data class NodeWidgetBean(
    val resourceId: MutableList<String>,
    val classCame: String,
    val text: String,
    val contentDesc: String,
) {
    companion object {
        fun createEmpty() = NodeWidgetBean(mutableListOf(""), "", "", "")
    }
}