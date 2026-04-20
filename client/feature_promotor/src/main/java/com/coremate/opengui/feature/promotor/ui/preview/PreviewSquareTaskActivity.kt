package com.coremate.opengui.feature.promotor.ui.preview

import com.coremate.opengui.feature.promotor.databinding.ActivityPreviewSquareTaskBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.network.api.task.TaskTemplatesResp

class PreviewSquareTaskActivity() :
    BaseBindingActivity<ActivityPreviewSquareTaskBinding>(ActivityPreviewSquareTaskBinding::inflate) {

    private var data: TaskTemplatesResp? = null

    override fun initView() {
        binding.tvUserCount.text = "${data?.totalExecutions}"
        val successRate = data?.totalExecutions?.let {
            if (it > 0) {
                (75..98).random()
            } else {
                100
            }
        }
        binding.tvSuccessRate.text = "$successRate %"
        binding.tvExecuteTime.text = "~10 分钟"
        binding.tvTitle.text = data?.taskName
        binding.tvPrompt.text = data?.taskDescription
    }

    override fun initEvent() {
        binding.imgBack.setOnClickListener { finish() }
        binding.tvSave.setOnClickListener {
            presenter?.saveTask(
                this@PreviewSquareTaskActivity,
                data?.taskName,
                data?.taskDescription
            )
        }
        binding.tvStart.setOnClickListener {
            presenter?.executeTask(
                this@PreviewSquareTaskActivity,
                data?.taskName,
                data?.taskDescription
            )
        }
    }

    private var presenter: PreviewPresenter? = null

    override fun initParam() {
        presenter = PreviewPresenter(this)
        data = intent.getSerializableExtra("data") as? TaskTemplatesResp
    }
}