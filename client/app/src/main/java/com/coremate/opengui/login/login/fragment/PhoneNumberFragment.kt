package com.coremate.opengui.login.login.fragment

import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import androidx.fragment.app.Fragment
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.R
import com.coremate.opengui.databinding.FragmentPhoneNumberPageBinding
import com.coremate.opengui.feature.promotor.R as FeatureR

class PhoneNumberFragment : Fragment() {
    private var _binding: FragmentPhoneNumberPageBinding? = null
    private val binding get() = _binding!!

    private var onCloseListener: (() -> Unit)? = null
    private var onRequestCodeListener: ((phone: String, aff: String) -> Unit)? = null

    private var selectedCountryCode: String = "+86"

    fun setOnCloseListener(listener: () -> Unit) {
        onCloseListener = listener
    }

    fun setRequestCodeListener(listener: (phone: String, aff: String) -> Unit) {
        onRequestCodeListener = listener
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPhoneNumberPageBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.vStatus.layoutParams.height = AMScreenUtils.getStatusBarHeight()

        binding.buttonBack.visibility = View.INVISIBLE
        binding.buttonBack.setOnClickListener {
            onCloseListener?.invoke()
        }

        setupCountryCodeSpinner()

        binding.inputPhone.addTextChangedListener(phoneTextWatcher)

        // 显示邀请码输入框（可选填），隐藏模式切换按钮
        binding.inviteCodeContainer.visibility = View.VISIBLE
        binding.buttonToggle.visibility = View.GONE

        binding.titleText.text = "欢迎"
        binding.subtitleText.text = "输入手机号即可登录"

        binding.buttonSubmit.setOnClickListener {
            handleSubmit()
        }

        updateSubmitButton()
    }

    private val phoneTextWatcher = object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
            updateSubmitButton()
        }

        override fun afterTextChanged(s: Editable?) {}
    }

    private fun isPhoneValid(): Boolean =
        binding.inputPhone.text.toString().trim().length >= 11

    private fun updateSubmitButton() {
        val can = isPhoneValid()
        binding.buttonSubmit.isEnabled = can
        binding.buttonSubmit.isClickable = can
        if (can) {
            binding.buttonSubmit.setBackgroundResource(FeatureR.drawable.button_submit_bg)
            binding.buttonSubmit.setTextColor(Color.WHITE)
        } else {
            binding.buttonSubmit.setBackgroundResource(R.drawable.login_bt_background_fail)
            binding.buttonSubmit.setTextColor(Color.WHITE)
        }
    }

    private fun setupCountryCodeSpinner() {
        try {
            val adapter = ArrayAdapter.createFromResource(
                requireContext(),
                R.array.CountryCode,
                R.layout.country_code_spinner_layout
            )
            adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
            binding.spinnerCountryCode.adapter = adapter
            binding.spinnerCountryCode.setBackgroundColor(0x0)
            binding.spinnerCountryCode.onItemSelectedListener =
                object : AdapterView.OnItemSelectedListener {
                    override fun onItemSelected(
                        parent: AdapterView<*>?,
                        view: View?,
                        position: Int,
                        id: Long
                    ) {
                        selectedCountryCode =
                            parent?.getItemAtPosition(position)?.toString() ?: "+86"
                    }

                    override fun onNothingSelected(parent: AdapterView<*>?) {}
                }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun handleSubmit() {
        if (!isPhoneValid()) return
        val phone = binding.inputPhone.text.toString().trim()
        val aff = binding.inputInviteCode.text.toString().trim()
        onRequestCodeListener?.invoke(phone, aff)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
