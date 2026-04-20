package com.coremate.opengui.feature.promotor.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.FragmentTaskSettingBinding

class TaskSettingFragment : Fragment() {

    private var _binding: FragmentTaskSettingBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentTaskSettingBinding.inflate(layoutInflater)
        val statusBarHeight = AMScreenUtils.getStatusBarHeight()
        val params = binding.topBar.layoutParams as ViewGroup.MarginLayoutParams
        params.setMargins(0, statusBarHeight, 0, 0)
        binding.topBar.layoutParams = params
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.swLike.setChecked(false)
        binding.swLike.setOnCheckedChangeListener { isChecked ->
        }
        binding.swComment.setChecked(false)
        binding.swComment.setOnCheckedChangeListener { isChecked ->
        }
        binding.imgGuideSwitch.setOnClickListener {
            if (binding.tvGuide.visibility == View.GONE) {
                binding.tvGuide.visibility = View.VISIBLE
                binding.imgGuideSwitch.setImageResource(R.drawable.icon_condense)
            } else {
                binding.tvGuide.visibility = View.GONE
                binding.imgGuideSwitch.setImageResource(R.drawable.icon_expand)
            }
        }
        binding.imgBack.setOnClickListener {
            parentFragmentManager.popBackStack()
        }
    }
}