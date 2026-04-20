package com.coremate.opengui.feature.promotor.common.bean

data class RecommendBean(val tags: List<String>, val title: String, val timeSpent: Int)
data class TaskCategoryBean(var isSelected:Boolean,val icon:Int, val title: String)