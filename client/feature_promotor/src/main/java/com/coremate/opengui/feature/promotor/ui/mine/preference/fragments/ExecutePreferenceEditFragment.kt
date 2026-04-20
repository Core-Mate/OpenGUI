package com.coremate.opengui.feature.promotor.ui.mine.preference.fragments

import android.app.Dialog
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.ExecutePreferenceEditBinding

class ExecutePreferenceEditFragment(var title: String, var content: String) :
    BottomSheetDialogFragment() {

    private lateinit var binding: ExecutePreferenceEditBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, R.style.BottomSheetDialog)
    }


    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        val dialog = super.onCreateDialog(savedInstanceState)
        dialog.setOnShowListener {
            val bottomSheet =
                dialog.findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)
            bottomSheet?.let {
                val behavior = BottomSheetBehavior.from(it)
                behavior.state = BottomSheetBehavior.STATE_EXPANDED
                behavior.skipCollapsed = true
                behavior.isFitToContents = true
            }
        }
        // 使用 ADJUST_RESIZE 确保内容不被键盘遮挡
        // 但不立即显示键盘，而是延迟显示以避免闪烁
        dialog.window?.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        )
        return dialog
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View? {
        binding = ExecutePreferenceEditBinding.inflate(layoutInflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.tvTitle.text = title
        binding.etContent.setText("$content")
        binding.tvWordCount.text = "${content.length}/20"
        binding.etContent.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(
                p0: CharSequence?,
                p1: Int,
                p2: Int,
                p3: Int
            ) {
            }

            override fun onTextChanged(
                p0: CharSequence?,
                p1: Int,
                p2: Int,
                p3: Int
            ) {
                binding.etContent.text.length.let {
                    if (it < 20) {
                        binding.tvWordCount.text = "${binding.etContent.text.length}/20"
                    } else {
                        binding.tvWordCount.text = binding.etContent.text.substring(0, 20)
                        binding.tvWordCount.text = "20/20"
                    }
                }
            }

            override fun afterTextChanged(p0: Editable?) {
            }

        })
        binding.tvCancel.setOnClickListener {
            dismiss()
        }
        binding.tvClean.setOnClickListener {
            binding.etContent.setText("")
        }
    }
}