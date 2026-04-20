package com.coremate.opengui.feature.promotor.ui

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.fragment.app.Fragment
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.feature.promotor.databinding.FragmentTasksBinding

// 导入自动化模块的特定Activity
import com.coremate.opengui.feature.promotor.ui.adapter.MissionScheduleListAdapter
import com.coremate.opengui.feature.promotor.ui.viewmodel.MissionViewModel
import com.coremate.opengui.network.api.mission_schedules.UIMissionSchedulesBean

@RequiresApi(Build.VERSION_CODES.O)
class TasksFragment : Fragment() {

    private var _binding: FragmentTasksBinding? = null
    private val binding get() = _binding!!

    private val uiMissionSchedulesBean = mutableListOf<UIMissionSchedulesBean>()

    private var viewModel: MissionViewModel? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentTasksBinding.inflate(inflater, container, false)
        val statusBarHeight = AMScreenUtils.getStatusBarHeight()
        val params = binding.topBar.layoutParams as ViewGroup.MarginLayoutParams
        params.setMargins(0, statusBarHeight, 0, 0)
        binding.topBar.layoutParams = params
        return binding.root
    }


    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel = MissionViewModel(requireContext())
        initData()
        initObserver()
        initListener()
    }

    private fun initListener() {
        binding.imgAddTask.setOnClickListener {
            val intent = Intent(context, CreateTaskActivity::class.java)
//            startActivity(intent)
            startForResult.launch(intent)

        }
    }

    private val startForResult = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        when (result.resultCode) {
            Activity.RESULT_OK -> {
                val data = result.data
                val returnedValue = data?.getBooleanExtra("result", false)
                returnedValue?.let {
                    // 处理返回的数据
                    viewModel?.generateEmptyUIData()
                }
            }
        }
    }

    private var missionScheduleListAdapter: MissionScheduleListAdapter? = null

    @RequiresApi(Build.VERSION_CODES.O)
    private fun initData() {
        missionScheduleListAdapter =
            MissionScheduleListAdapter(requireContext(), uiMissionSchedulesBean)
        binding.missionList.adapter = missionScheduleListAdapter
        viewModel?.generateEmptyUIData()
    }

    private fun initObserver() {
        viewModel?.uiMissionScheduleDataList?.observe(viewLifecycleOwner) {
            uiMissionSchedulesBean.clear()
            uiMissionSchedulesBean.addAll(it)
            missionScheduleListAdapter?.notifyDataSetChanged()
        }

    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}