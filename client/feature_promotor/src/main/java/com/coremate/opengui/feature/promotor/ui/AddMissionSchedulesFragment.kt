package com.coremate.opengui.feature.promotor.ui

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.feature.promotor.databinding.FragmentAddMissionSchedulesBinding
import com.coremate.opengui.feature.promotor.ui.adapter.MissionListAdapter
import com.coremate.opengui.feature.promotor.ui.viewmodel.MissionViewModel
import com.coremate.opengui.network.api.mission.MissionBean
import com.coremate.opengui.network.api.mission.UIMissionBean
import com.coremate.opengui.network.api.mission_schedules.AddMissionSchedulesRequestBean
import org.json.JSONObject
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

@RequiresApi(Build.VERSION_CODES.O)
class AddMissionSchedulesFragment() : Fragment() {

    private var _binding: FragmentAddMissionSchedulesBinding? = null
    private val binding get() = _binding!!

    private var viewModel: MissionViewModel? = null

    private var selectedMission: MissionBean? = null

    private var missionStart: String? = null
    private var missionEnd: String? = null
    private var selectColor: JSONObject? = null


    private val deviceId: String by lazy {
        Settings.Secure.getString(
            activity?.application?.contentResolver,
            Settings.Secure.ANDROID_ID
        )
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAddMissionSchedulesBinding.inflate(layoutInflater)
        val statusBarHeight = AMScreenUtils.getStatusBarHeight()
        val params = binding.topBar.layoutParams as ViewGroup.MarginLayoutParams
        params.setMargins(0, statusBarHeight, 0, 0)
        binding.topBar.layoutParams = params
        return binding.root
    }


    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel = MissionViewModel(requireContext())
        viewModel?.getMissions()
        initViews()
        initListener()
        initTaskColorList()
        initLiveData()
    }

    private fun initLiveData() {
        viewModel?.saveMissionScheduleLiveData?.observe(viewLifecycleOwner) {
            if (it) {
                val resultData = Intent().apply {
                    putExtra("result", it)
                }
                activity?.setResult(Activity.RESULT_OK, resultData)
                activity?.finish()
            }
        }
    }

    private fun initViews() {
        val uiMissionsList = mutableListOf<UIMissionBean>()
        val adapter = context?.let { MissionListAdapter(it, uiMissionsList) }
        binding.taskList.adapter = adapter
        binding.taskList.onItemClickListener =
            AdapterView.OnItemClickListener { _, _, p2, _ ->
                uiMissionsList.forEachIndexed { index, uiMissionBean ->
                    if (p2 == index) {
                        uiMissionBean.checked = true
                        selectedMission = uiMissionBean.missionBean
                    } else {
                        uiMissionBean.checked = false
                    }
                }
                adapter?.notifyDataSetChanged()
            }

        viewModel?.missionDataListLiveData?.observe(viewLifecycleOwner) {
            it?.forEachIndexed { _, missionBean ->
                val uiMissionBean = UIMissionBean(false, missionBean)
                uiMissionsList.add(uiMissionBean)
                adapter?.notifyDataSetChanged()
            }
        }
    }

    private fun initListener() {
        binding.imgClose.setOnClickListener {
            activity?.finish()
        }
        binding.cardExecuteTimeRange.setOnClickListener {
            TimePickerFragment(object : SelectNumberCallback {
                override fun callback(
                    startTime: Pair<String, String>,
                    endTime: Pair<String, String>
                ) {
                    binding.tvExecuteTimeRange.text =
                        "${startTime.first}:${startTime.second}"
                    missionStart =
                        convertBeijingTimeForUTC((startTime.first).toInt(), (startTime.second).toInt())
                    missionEnd = addMinutesToUTCInstant(missionStart!!, 30)
                }
            }).show(parentFragmentManager, "MyBottomSheetDialog")
        }
        binding.cardSaveWrap.setOnClickListener {
            if (selectedMission == null) {
                Toast.makeText(requireContext(), "No task selected yet", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (missionStart == null || missionEnd == null) {
                Toast.makeText(requireContext(), "No execution time selected yet", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            if (selectColor == null) {
                Toast.makeText(requireContext(), "No task color selected yet", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val bean = AddMissionSchedulesRequestBean(
                selectedMission!!.id,
                missionStart!!,
                missionEnd!!,
                selectColor!!.toString(),
                deviceId
            )
            viewModel?.addMissionSchedule(bean)
        }
    }

    fun convertBeijingTimeForUTC(hour: Int, minute: Int): String {

        val beijingZone = ZoneId.of("Asia/Shanghai")
        val utcZone = ZoneId.of("UTC")


        val nowBeijing = ZonedDateTime.now(beijingZone)


        var targetBeijingTime = nowBeijing.withHour(hour)
            .withMinute(minute)
            .withSecond(0)
            .withNano(0)


        if (targetBeijingTime.isBefore(nowBeijing)) {
            targetBeijingTime = targetBeijingTime.plusDays(1)
        }


        val targetUtcTime = targetBeijingTime.withZoneSameInstant(utcZone)


        return DateTimeFormatter.ISO_INSTANT.format(targetUtcTime.toInstant())
    }

    private fun addMinutesToUTCInstant(utcInstantString: String, minutesToAdd: Int): String {
        val instant = Instant.parse(utcInstantString)
        val result = instant.plusSeconds((minutesToAdd * 60).toLong())
        return DateTimeFormatter.ISO_INSTANT.format(result)
    }

    fun getDateTimeISO8601(hour: Int, minute: Int): String {

        val beijingZone = ZoneId.of("Asia/Shanghai")
        val currentBeijingTime = ZonedDateTime.now(beijingZone)
        

        val todayBeijing = currentBeijingTime.toLocalDate()
        

        val inputTime = LocalTime.of(hour, minute)
        

        val inputDateTimeToday = LocalDateTime.of(todayBeijing, inputTime)
        val inputZonedDateTimeToday = inputDateTimeToday.atZone(beijingZone)
        

        val targetZonedDateTime = if (inputZonedDateTimeToday.isBefore(currentBeijingTime)) {

//            val tomorrowBeijing = todayBeijing.plusDays(1)
//            val inputDateTimeTomorrow = LocalDateTime.of(tomorrowBeijing, inputTime)
//            inputDateTimeTomorrow.atZone(beijingZone)
            inputZonedDateTimeToday
        } else {

            inputZonedDateTimeToday
        }
        

        return targetZonedDateTime.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
    }

    private fun initTaskColorList() {
        binding.rvTaskColor.layoutManager =
            LinearLayoutManager(requireContext(), LinearLayoutManager.HORIZONTAL, false)

        val colors = listOf(
            intArrayOf(0xFF9764F5CC.toInt(), 0xFF4B77FDCC.toInt()),
            intArrayOf(0xFFFC724F.toInt(), 0xFFE976B9.toInt()),
            intArrayOf(0xFFFC724F.toInt(), 0xFFB96AEA.toInt()),
            intArrayOf(0xFF42CA8D.toInt(), 0xFF4EABEE.toInt()),
            intArrayOf(0xFF1585D5.toInt(), 0xFF4EABEE.toInt()),
            intArrayOf(0xFFE16DAB.toInt(), 0xFF9F67DF.toInt()),
            intArrayOf(0xFFFA804F.toInt(), 0xFFEB2279.toInt()),
            intArrayOf(0xFFE1A33F.toInt(), 0xFFF0775B.toInt())
        )

        val adapter = TaskColorAdapter(colors) { colors ->
            val jsonObject = JSONObject()
            jsonObject.put("startColor",colors[0])
            jsonObject.put("endColor",colors[1])
            selectColor = jsonObject
            Log.d("TAG", "initTaskColorList: ----->$selectColor")
        }
        binding.rvTaskColor.adapter = adapter
    }

    fun toHexString(colorInt: Int): String {
        return String.format("#%08X", colorInt)
    }

    interface SelectNumberCallback {
        fun callback(startTime: Pair<String, String>, endTime: Pair<String, String>)
    }
}