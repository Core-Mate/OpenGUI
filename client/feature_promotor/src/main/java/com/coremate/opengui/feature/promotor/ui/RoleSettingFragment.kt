package com.coremate.opengui.feature.promotor.ui

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.text.Editable
import android.text.InputFilter
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.fragment.app.Fragment
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.feature.promotor.databinding.FragmentRoleSettingBinding
import com.coremate.opengui.feature.promotor.ui.viewmodel.AiRoleViewModel
import com.tencent.mmkv.MMKV

@RequiresApi(Build.VERSION_CODES.O)
class RoleSettingFragment : Fragment() {
    private var _binding: FragmentRoleSettingBinding? = null
    private val binding get() = _binding!!
    private var viewModel: AiRoleViewModel? = null
    private val MAX_INPUT_WORD_COUNT = 50
    private var remoteHaveRole = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentRoleSettingBinding.inflate(inflater, container, false)
        val statusBarHeight = AMScreenUtils.getStatusBarHeight()
        val params = binding.topBar.layoutParams as ViewGroup.MarginLayoutParams
        params.setMargins(0, statusBarHeight, 0, 0)
        binding.topBar.layoutParams = params
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel = AiRoleViewModel(requireContext())
        initView()
        initListener()
    }

    private fun initListener() {
        binding.etPersonalTitle.filters = arrayOf(InputFilter.LengthFilter(MAX_INPUT_WORD_COUNT))
        binding.etPersonalTitle.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val currentLength = s?.length ?: 0
                binding.tvPersonalTitleWordCount.text = "$currentLength/$MAX_INPUT_WORD_COUNT"
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        binding.etIndustry.filters = arrayOf(InputFilter.LengthFilter(MAX_INPUT_WORD_COUNT))
        binding.etIndustry.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val currentLength = s?.length ?: 0
                binding.tvIndustryWordCount.text = "$currentLength/$MAX_INPUT_WORD_COUNT"
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        binding.etProductCategory.filters = arrayOf(InputFilter.LengthFilter(MAX_INPUT_WORD_COUNT))
        binding.etProductCategory.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val currentLength = s?.length ?: 0
                binding.tvProductCategoryWordCount.text = "$currentLength/$MAX_INPUT_WORD_COUNT"
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        binding.etProductFeatures.filters = arrayOf(InputFilter.LengthFilter(MAX_INPUT_WORD_COUNT))
        binding.etProductFeatures.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val currentLength = s?.length ?: 0
                binding.tvProductFeaturesWordCount.text = "$currentLength/$MAX_INPUT_WORD_COUNT"
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        binding.etTargetCustomerGroup.filters =
            arrayOf(InputFilter.LengthFilter(MAX_INPUT_WORD_COUNT))
        binding.etTargetCustomerGroup.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val currentLength = s?.length ?: 0
                binding.tvTargetCustomerGroupWordCount.text = "$currentLength/$MAX_INPUT_WORD_COUNT"
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        binding.etTargetCustomerCity.filters =
            arrayOf(InputFilter.LengthFilter(MAX_INPUT_WORD_COUNT))
        binding.etTargetCustomerCity.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) {
                val currentLength = s?.length ?: 0
                binding.tvTargetCustomerCityWordCount.text = "$currentLength/$MAX_INPUT_WORD_COUNT"
            }

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })
        binding.tvClean.setOnClickListener {

            binding.etPersonalTitle.clearFocus()
            binding.etIndustry.clearFocus()
            binding.etProductCategory.clearFocus()
            binding.etProductFeatures.clearFocus()
            binding.etTargetCustomerGroup.clearFocus()
            binding.etTargetCustomerCity.clearFocus()


            binding.etPersonalTitle.text = null
            binding.etIndustry.text = null
            binding.etProductCategory.text = null
            binding.etProductFeatures.text = null
            binding.etTargetCustomerGroup.text = null
            binding.etTargetCustomerCity.text = null


            binding.tvPersonalTitleWordCount.text = "0/$MAX_INPUT_WORD_COUNT"
            binding.tvIndustryWordCount.text = "0/$MAX_INPUT_WORD_COUNT"
            binding.tvProductCategoryWordCount.text = "0/$MAX_INPUT_WORD_COUNT"
            binding.tvProductFeaturesWordCount.text = "0/$MAX_INPUT_WORD_COUNT"
            binding.tvTargetCustomerGroupWordCount.text = "0/$MAX_INPUT_WORD_COUNT"
            binding.tvTargetCustomerCityWordCount.text = "0/$MAX_INPUT_WORD_COUNT"


            binding.root.requestFocus()
        }
        binding.tvSave.setOnClickListener {
            viewModel?.aiRole?.personalTitle =
                binding.etPersonalTitle.text.toString().trim()
            viewModel?.aiRole?.industry =
                binding.etIndustry.text.toString().trim()
            viewModel?.aiRole?.productCategory =
                binding.etProductCategory.text.toString().trim()
            viewModel?.aiRole?.productFeatures =
                binding.etProductFeatures.text.toString().trim()
            viewModel?.aiRole?.targetCustomerGroup =
                binding.etTargetCustomerGroup.text.toString().trim()
            viewModel?.aiRole?.targetCustomerCity =
                binding.etTargetCustomerCity.text.toString().trim()


            binding.root.requestFocus()
            val result = viewModel?.validateRequiredFields(viewModel?.aiRole)
            if (result == false) {
                Toast.makeText(requireContext(), "Required fields are empty", Toast.LENGTH_SHORT).show()
            } else {
                if (remoteHaveRole) {
                    viewModel?.updateAiRoleConfig()
                } else {
                    viewModel?.saveAiRoleConfig()
                }
            }
        }
    }

    private fun initView() {
        viewModel?.getAiRoleConfig()
        val phone =
            MMKV.defaultMMKV().decodeString("Phone", null)
//        val model =
//            MMKV.defaultMMKV().decodeString("Model", "uitars")
//        if (model.equals("uitars")) {
//            binding.rbUitars.isChecked = true
//        } else {
//            binding.rbMobilev3.isChecked = true
//        }
        viewModel?.aiRole?.roleName = phone
        viewModel?.aiRole?.userNickname = phone
        binding.tvPhone.text = phone?.replaceRange(3, 7, "****")
        viewModel?.aiRoleLiveData?.observe(viewLifecycleOwner) {
            binding.etPersonalTitle.setText(it.personalTitle)
            binding.etIndustry.setText(it.industry)
            binding.etProductCategory.setText(it.productCategory)
            binding.etProductFeatures.setText(it.productFeatures)
            binding.etTargetCustomerGroup.setText(it.targetCustomerGroup)
            binding.etTargetCustomerCity.setText(it.targetCustomerCity)
        }
        viewModel?.remoteHaveAiRoleLiveData?.observe(viewLifecycleOwner) {
            remoteHaveRole = it
        }
        viewModel?.saveSuccessLiveData?.observe(viewLifecycleOwner) {
            if (it) {
                val resultData = Intent().apply {
                    putExtra("PersonalTitle", binding.etPersonalTitle.text.toString())
                }
                val mmkv = MMKV.defaultMMKV()
                mmkv.encode("PersonalTitle", binding.etPersonalTitle.text.toString())
//                if (binding.rbUitars.isChecked) {
//                    mmkv.encode("Model", "uitars")
//                } else {
//                    mmkv.encode("Model", "mobilev3")
//                }
                activity?.setResult(Activity.RESULT_OK, resultData)
                activity?.finish()
            }
        }
        binding.imgClose.setOnClickListener {
            activity?.finish()
        }
    }
}