package com.coremate.opengui.common

import android.content.Context
import com.coremate.opengui.common.log.LogManager

object TaskCenter {
    enum class TaskState {
        PLAN,
        EXECUTE,
        SUMMARY,
        NONE
    }

    @Volatile
    var taskId: Int? = null

    @Volatile
    var taskTitle: String? = null

    @Volatile
    var taskPrompt: String? = null

    @Volatile
    var executionId: Int? = null

    @Volatile
    var isFork: Boolean = false

    @Volatile
    var currentTaskState: TaskState = TaskState.NONE

    @Volatile
    var isSummarizing: Boolean = false


    fun reset(context: Context, from: String) {
        LogManager.saveLog(context, "TaskCenter", "TaskCenter | reset | from = $from",
            executionId ?:-1)
        taskId = null
        taskTitle = null
        taskPrompt = null
        executionId = null
        isFork = false
    }
}