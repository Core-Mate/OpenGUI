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
        binding.titlebar.setTitle("Consumption records").setLeftIconClickListener {
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

        recordList.add(
            ConsumptionRecordByDate(
                date = "2025-01-24",
                dateLabel = "Jan 24",
                totalPoints = 0.7,
                entries = listOf(
                    ConsumptionEntry(
                        id = "1",
                        appName = "Twitter/X",
                        taskTitle = "Batch Scheduled Tweet Posting",
                        timeRange = "14:22 - 14:45",
                        points = 0.4
                    ),
                    ConsumptionEntry(
                        id = "2",
                        appName = "Xiaohongshu",
                        taskTitle = "One-click Article Layout and Distribution",
                        timeRange = "10:30 - 10:45",
                        points = 0.3
                    )
                )
            )
        )
        recordList.add(
            ConsumptionRecordByDate(
                date = "2025-01-23",
                dateLabel = "1Month23Day",
                totalPoints = 0.7,
                entries = listOf(
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "Batch Marketing Email Sending",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "Batch Marketing Email Sending",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "Batch Marketing Email Sending",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "Batch Marketing Email Sending",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "Batch Marketing Email Sending",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    ),
                    ConsumptionEntry(
                        id = "3",
                        appName = "Mailchimp",
                        taskTitle = "Batch Marketing Email Sending",
                        timeRange = "09:00 - 09:42",
                        points = 0.7
                    )
                )
            )
        )
        adapter?.setData(recordList)
    }
}
