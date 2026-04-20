package com.coremate.opengui.feature.promotor.ui

import android.app.Dialog
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.widget.NumberPicker
import android.widget.TextView
import androidx.annotation.RequiresApi
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.coremate.opengui.feature.promotor.R
import java.util.Calendar

@RequiresApi(Build.VERSION_CODES.O)
class TimePickerFragment(private val callback: AddMissionSchedulesFragment.SelectNumberCallback) :
    BottomSheetDialogFragment() {
    private var startTime: Pair<String, String>? = null
    private var endTime: Pair<String, String>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, R.style.AppBottomSheet)
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val dialog = super.onCreateDialog(savedInstanceState)
        val view = LayoutInflater.from(context).inflate(R.layout.bottom_sheet_time_picker, null)
        dialog.setContentView(view)
        isCancelable = false
        dialog.setCanceledOnTouchOutside(false)

        val leftPicker = view.findViewById<NumberPicker>(R.id.picker_left)
        val rightPicker = view.findViewById<NumberPicker>(R.id.picker_right)
        val cancel = view.findViewById<TextView>(R.id.tv_cancel)
        val confirm = view.findViewById<TextView>(R.id.tv_confirm)
        val rightValue = arrayOf("00", "30")

        leftPicker.minValue = 0
        leftPicker.maxValue = 23
        leftPicker.wrapSelectorWheel = true
        leftPicker.descendantFocusability = NumberPicker.FOCUS_BLOCK_DESCENDANTS
        leftPicker.displayedValues = (0..23).map { String.format("%02d", it) }.toTypedArray()
        leftPicker.value = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)

        rightPicker.minValue = 0
        rightPicker.maxValue = 1
        rightPicker.wrapSelectorWheel = true
        rightPicker.descendantFocusability = NumberPicker.FOCUS_BLOCK_DESCENDANTS
        rightPicker.displayedValues = rightValue
        rightPicker.value = 0

        cancel.setOnClickListener {
            dismiss()
        }
        confirm.setOnClickListener {
            if (startTime == null) {
                startTime =
                    Pair(String.format("%02d", leftPicker.value), rightValue[rightPicker.value])
                endTime =
                    Pair(String.format("%02d", leftPicker.value), rightValue[rightPicker.value])
                callback.callback(startTime!!, endTime!!)
                dismiss()
            }
        }
        return dialog
    }
}