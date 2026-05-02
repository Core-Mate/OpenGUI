package com.coremate.opengui.automation.biz.tasks.common.check.test

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.icu.util.Calendar
import android.os.Bundle
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import com.coremate.opengui.automation.AMServiceManager
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.utils.AMToastUtils
import com.coremate.opengui.automation.biz.tasks.common.check.bean.AMCommonAutoReplyParam
import com.coremate.opengui.automation.biz.type.AMTaskBizType
import com.coremate.opengui.automation.databinding.ActivityAmcommonAutoTestReplyBinding
import java.text.SimpleDateFormat
import java.util.Locale

class AMCommonAutoReplyTestActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAmcommonAutoTestReplyBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize binding
        binding = ActivityAmcommonAutoTestReplyBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Set default values
        val now = Calendar.getInstance()
        val later = Calendar.getInstance().apply {
            add(Calendar.MINUTE, 15)
        }

        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        binding.startTime.text = sdf.format(now.time)
        binding.endTime.text = sdf.format(later.time)


        binding.startTime.setOnClickListener {
            showDateTimePicker(binding.startTime)
        }

        binding.endTime.setOnClickListener {
            showDateTimePicker(binding.endTime)
        }

        if (binding.etInterval.text.isEmpty()) {
            AMToastUtils.showToast("请输入间隔时间")
            return
        }
        binding.btnStart.setOnClickListener {
            val param = AMCommonAutoReplyParam(
                binding.endTime.text.toString(),
                binding.etInterval.text.toString().toInt()
            )
            AMServiceManager.instance.processTask(
                this,
                AMDataContainer(AMTaskBizType.COMMON_AUTO_REPLY, param)
            )
        }

    }

    private fun showDateTimePicker(targetView: TextView) {
        val calendar = Calendar.getInstance()

        DatePickerDialog(
            this,
            { _, year, month, dayOfMonth ->
                // Show the time picker after date selection
                calendar.set(Calendar.YEAR, year)
                calendar.set(Calendar.MONTH, month)
                calendar.set(Calendar.DAY_OF_MONTH, dayOfMonth)

                TimePickerDialog(
                    this,
                    { _, hourOfDay, minute ->
                        calendar.set(Calendar.HOUR_OF_DAY, hourOfDay)
                        calendar.set(Calendar.MINUTE, minute)
                        calendar.set(Calendar.SECOND, 0)

                        // Format time
                        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
                        val formatted = sdf.format(calendar.time)
                        targetView.text = formatted
                    },
                    calendar.get(Calendar.HOUR_OF_DAY),
                    calendar.get(Calendar.MINUTE),
                    true
                ).show()

            },
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH),
            calendar.get(Calendar.DAY_OF_MONTH)
        ).show()
    }
}