package com.coremate.opengui.feature.promotor.ui

import com.coremate.opengui.feature.promotor.databinding.WindowExecuteTask2Binding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity

enum class TaskState {
    PLAYING, PAUSING
}

class TestActivity :
    BaseBindingActivity<WindowExecuteTask2Binding>(WindowExecuteTask2Binding::inflate) {

    private var currentTaskState: TaskState = TaskState.PLAYING

    override fun initView() {
    }

    override fun initEvent() {
    }

    override fun initParam() {
        TODO("Not yet implemented")
    }

}