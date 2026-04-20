package com.coremate.opengui.feature.promotor.ui.mine.payrecord

import android.view.View
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.databinding.ActivityPayRecordBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity

class PayRecordActivity :
    BaseBindingActivity<ActivityPayRecordBinding>(ActivityPayRecordBinding::inflate) {

    private val recordList = mutableListOf<ConsumptionRecordByDate>()
    private var adapter: PayRecordListAdapter? = null

    override fun initView() {
        binding.titlebar.setTitle("消费记录").setLeftIconClickListener {
            finish()
        }
        binding.titlebar.getMoreBtn().visibility = View.INVISIBLE
        adapter = PayRecordListAdapter()
        binding.rvPayRecordList.adapter = adapter
        binding.rvPayRecordList.layoutManager = LinearLayoutManager(this)
        binding.rvPayRecordList.overScrollMode = RecyclerView.OVER_SCROLL_NEVER
        binding.rvPayRecordList.isNestedScrollingEnabled = false
        adapter?.setData(recordList)
    }

    override fun initEvent() {
    }

    override fun initParam() {
        // 写死数据，与 Web ConsumptionRecordPage MOCK_RECORDS 一致
        recordList.add(
            ConsumptionRecordByDate(
                date = "2025-01-24",
                dateLabel = "1月24日",
                totalPoints = 0.7,
                entries = listOf(
                    ConsumptionEntry(
                        id = "1",
                        appName = "Twitter/X",
                        taskTitle = "推文批量定时发布",
                        timeRange = "14:22 - 14:45",
                        points = 0.4
                    ),
                    ConsumptionEntry(
                        id = "2",
                        appName = "小红书",
                        taskTitle = "图文一键排版分发",
                        timeRange = "10:30 - 10:45",
                        points = 0.3
                    )
                )
            )
        )
        recordList.add(
            ConsumptionRecordByDate(
                date = "2025-01-23",
                dateLabel = "1月23日",
                totalPoints = 0.7,
                entries = listOf(
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "营销邮件批量发送",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "营销邮件批量发送",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "营销邮件批量发送",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "营销邮件批量发送",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "营销邮件批量发送",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "营销邮件批量发送",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    )
                )
            )
        )
        adapter?.setData(recordList)
    }
}
