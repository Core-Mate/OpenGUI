package com.coremate.opengui.feature.promotor.ui.viewmodel

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coremate.opengui.automation.base.utils.AMToastUtils
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.mission.MissionBean
import com.coremate.opengui.network.api.mission_schedules.AddMissionSchedulesRequestBean
import com.coremate.opengui.network.api.mission_schedules.MissionSchedulesBean
import com.coremate.opengui.network.api.mission_schedules.UIMissionSchedulesBean
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeParseException
import java.util.Calendar
import java.util.Locale

@RequiresApi(Build.VERSION_CODES.O)
class MissionViewModel(context: Context) : ViewModel() {
    private var missionScheduleDataList = MutableLiveData<MutableList<MissionSchedulesBean>?>()
    var missionDataListLiveData = MutableLiveData<MutableList<MissionBean>?>()
    val isShowLoading = MutableLiveData<Boolean>()
    private var apiService = RetrofitClient.create(context)

    var uiMissionScheduleDataList = MutableLiveData<MutableList<UIMissionSchedulesBean>>()


    private var pendingSchedules: MutableList<MissionSchedulesBean>? = null
    private var pendingMissions: MutableList<MissionBean>? = null

    var saveMissionScheduleLiveData = MutableLiveData<Boolean>()

    /**
     */
    fun generateEmptyUIData() {
        val timeList = mutableListOf<UIMissionSchedulesBean>()
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
        }

        val formatter = SimpleDateFormat("HH:mm", Locale.getDefault())

        for (i in 1..48) {

            val currentTime = formatter.format(calendar.time)
            var bean: UIMissionSchedulesBean?
            if (i % 2 == 1) {
                bean = UIMissionSchedulesBean(timeTag = currentTime, false, null, null)
            } else {
                bean = UIMissionSchedulesBean(timeTag = currentTime, false, null, null)
            }
            timeList.add(bean)
            calendar.add(Calendar.MINUTE, 30)
        }
        uiMissionScheduleDataList.value = timeList
        getMissionSchedules()
        getMissions()
    }

    /**
     */
    private fun tryPublish() {
        val schedules = pendingSchedules
        val missions = pendingMissions
        if (schedules != null && missions != null) {
            missionScheduleDataList.value = schedules
            missionDataListLiveData.value = missions
            schedules.forEachIndexed { index, missionSchedulesBean ->
                val startTime = missionSchedulesBean.startTime
                val year = startTime.toUtcTime().year
                val month = startTime.toUtcTime().month
                val day = startTime.toUtcTime().dayOfMonth

                val isSameDay = isSameDayAsBeijingTime(startTime)
                if(!isSameDay){
                    return@forEachIndexed
                }

                val time = getBeijingHourAndMinuteFromUTC(startTime)

                val hour = if (time?.first!! >= 10) {
                    time.first
                } else {
                    "0${time.first}"
                }
                val minute = if (time.second >= 10) {
                    time.second
                } else {
                    "0${time.second}"
                }

                val timeTag = "$hour:$minute"
                val mission = missions.find { it.id == missionSchedulesBean.missionId }
                val uiMissionSchedulesBean =
                    UIMissionSchedulesBean(
                        timeTag,
                        false,
                        mission?.customName,
                        missionSchedulesBean
                    )
                val indexOfFirst =
                    uiMissionScheduleDataList.value?.indexOfFirst {
                        it.timeTag == timeTag
                    }
                if (indexOfFirst != -1) {
                    uiMissionScheduleDataList.value!![indexOfFirst!!] = uiMissionSchedulesBean
                }
            }
            uiMissionScheduleDataList.value = uiMissionScheduleDataList.value?.toMutableList()
            pendingSchedules = null
            pendingMissions = null
            isShowLoading.value = false
        }
    }

    fun getBeijingHourAndMinuteFromUTC(utcTimeString: String): Pair<Int, Int>? {

        val beijingZone = ZoneId.of("Asia/Shanghai")
        try {


            val utcTime = ZonedDateTime.parse(utcTimeString)



            val beijingTime = utcTime.withZoneSameInstant(beijingZone)


            val hour = beijingTime.hour
            val minute = beijingTime.minute


            return Pair(hour, minute)

        } catch (e: DateTimeParseException) {

            println("Error: Invalid UTC time string format. Expected format example: 2025-09-20T15:12:43.453Z")
            return null
        }
    }

    fun isSameDayAsBeijingTime(utcTimeString: String): Boolean {

        val beijingZone = ZoneId.of("Asia/Shanghai")
        try {


            val utcTime = ZonedDateTime.parse(utcTimeString)

            val beijingTime = utcTime.withZoneSameInstant(beijingZone)

            val todayInBeijing = LocalDate.now(beijingZone)

            return beijingTime.toLocalDate().isEqual(todayInBeijing)
        } catch (e: DateTimeParseException) {

            println("Error: Invalid UTC time string format. Expected format example: 2025-09-20T15:12:43.453Z")
            return false
        }
    }

    private fun getMissionSchedules() {
        isShowLoading.value = true
        viewModelScope.launch {
            runCatching {
                apiService.getMissionSchedules()
            }.onSuccess {
                val body = it.body()
                if (body != null) {
                    pendingSchedules = body
                    tryPublish()
                } else {
                    isShowLoading.value = false
                }
            }.onFailure {
                it.printStackTrace()
                isShowLoading.value = false
                AMToastUtils.showToast("Network loading failed")
            }
        }
    }

    fun getMissions() {
        isShowLoading.value = true
        viewModelScope.launch {
            runCatching {
                apiService.getMissions()
            }.onSuccess {
                val body = it.body()
                if (body != null) {
                    pendingMissions = body
                    missionDataListLiveData.value = pendingMissions
                    tryPublish()
                } else {
                    isShowLoading.value = false
                }
            }.onFailure {
                it.printStackTrace()
                isShowLoading.value = false
                AMToastUtils.showToast("Network loading failed")
            }
        }
    }

    fun addMissionSchedule(bean: AddMissionSchedulesRequestBean) {
        viewModelScope.launch {
            runCatching {
                apiService.addMissionSchedules(bean)
            }.onSuccess {
                Log.d("", "addMissionSchedule: Saved successfully${it.body()}}")
                saveMissionScheduleLiveData.value = true
            }.onFailure {
                it.printStackTrace()
                isShowLoading.value = false
                AMToastUtils.showToast("Network loading failed")
            }
        }
    }

    private fun String.toUtcTime(): ZonedDateTime =
        Instant.parse(this).atZone(ZoneOffset.of("+8"))
}