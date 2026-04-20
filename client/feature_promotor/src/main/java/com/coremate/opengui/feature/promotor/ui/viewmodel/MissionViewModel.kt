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

    // 临时缓存：仅当两个接口都成功返回后，才一次性发布到 LiveData
    private var pendingSchedules: MutableList<MissionSchedulesBean>? = null
    private var pendingMissions: MutableList<MissionBean>? = null

    var saveMissionScheduleLiveData = MutableLiveData<Boolean>()

    /**
     * 预先生成 24 小时带时间标签的空数据
     */
    fun generateEmptyUIData() {
        val timeList = mutableListOf<UIMissionSchedulesBean>()
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
        }
        // SimpleDateFormat 用于将时间格式化为 "HH:mm"
        val formatter = SimpleDateFormat("HH:mm", Locale.getDefault())

        for (i in 1..48) {
            // 添加当前时间
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
     * mission 和 mission_schedule 都有数据了，再通知订阅
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
        // 1. 定义北京时区
        val beijingZone = ZoneId.of("Asia/Shanghai")
        try {
            // 2. 解析输入的 UTC 时间字符串
            // ZonedDateTime.parse() 会自动识别字符串中的时区信息（如结尾的 'Z'）
            val utcTime = ZonedDateTime.parse(utcTimeString)

            // 3. 将 UTC 时间转换为北京时区的时间
            // withZoneSameInstant 会在转换时自动处理小时和日期的偏移
            val beijingTime = utcTime.withZoneSameInstant(beijingZone)

            // 4. 从转换后的时间中提取小时和分钟
            val hour = beijingTime.hour
            val minute = beijingTime.minute

            // 5. 返回一个包含小时和分钟的 Pair
            return Pair(hour, minute)

        } catch (e: DateTimeParseException) {
            // 如果输入的字符串格式不正确，则返回 null 或抛出异常
            println("错误: 无效的 UTC 时间字符串格式。请确保格式正确，例如: 2025-09-20T15:12:43.453Z")
            return null
        }
    }

    fun isSameDayAsBeijingTime(utcTimeString: String): Boolean {
        // 定义北京时区
        val beijingZone = ZoneId.of("Asia/Shanghai")
        try {
            // 1. 解析输入的UTC时间字符串为 ZonedDateTime 对象
            // 确保输入字符串带有 'Z' 或时区信息
            val utcTime = ZonedDateTime.parse(utcTimeString)
            // 2. 将 UTC 时间转换为北京时区的 ZonedDateTime
            val beijingTime = utcTime.withZoneSameInstant(beijingZone)
            // 3. 获取当前的北京日期
            val todayInBeijing = LocalDate.now(beijingZone)
            // 4. 比较转换后的北京时间的日期部分是否与今天的日期相同
            return beijingTime.toLocalDate().isEqual(todayInBeijing)
        } catch (e: DateTimeParseException) {
            // 处理解析错误，例如输入格式不正确
            println("错误: 无效的 UTC 时间字符串格式。请确保格式正确，例如: 2025-09-20T15:12:43.453Z")
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
                AMToastUtils.showToast("网络加载失败")
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
                AMToastUtils.showToast("网络加载失败")
            }
        }
    }

    fun addMissionSchedule(bean: AddMissionSchedulesRequestBean) {
        viewModelScope.launch {
            runCatching {
                apiService.addMissionSchedules(bean)
            }.onSuccess {
                Log.d("", "addMissionSchedule: 保存成功${it.body()}}")
                saveMissionScheduleLiveData.value = true
            }.onFailure {
                it.printStackTrace()
                isShowLoading.value = false
                AMToastUtils.showToast("网络加载失败")
            }
        }
    }

    private fun String.toUtcTime(): ZonedDateTime =
        Instant.parse(this).atZone(ZoneOffset.of("+8"))
}