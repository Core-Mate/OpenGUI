package com.coremate.opengui.feature.promotor.viewmodel

import android.app.Application
import android.widget.Toast
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.coremate.opengui.common.utils.AndroidLogger
import com.coremate.opengui.common.utils.HapticFeedbackHelper
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.common_jvm.event.StopReason
import com.coremate.opengui.common_jvm.utils.Logger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class PromotorViewModel(application: Application) : AndroidViewModel(application) {

    private val TAG = "PromotorViewModel"
    private val runtimeLogger: Logger = AndroidLogger()
    private val _currentAutomationTaskId = MutableStateFlow<Long?>(null)
    private val _toolThoughtContent = MutableStateFlow<String?>(null)
    private val _currentTaskId = MutableStateFlow<Long?>(null)
    private val _isTaskPaused = MutableStateFlow(false)

    init {
        viewModelScope.launch {
            AutomationEventBus.events.collectLatest { event ->
                when (event) {
                    is AutomationEvent.Stopped -> {
                        runtimeLogger.debug(
                            TAG,
                            "AutomationEvent.Stopped received with reason: ${event.reason}."
                        )
                        when (event.reason) {
                            StopReason.COMPLETED -> HapticFeedbackHelper.success(getApplication())
                            StopReason.ERROR -> HapticFeedbackHelper.error(getApplication())
                            else -> {}
                        }
                        _currentAutomationTaskId.value = null
                    }

                    is AutomationEvent.Paused -> {
                        runtimeLogger.info(
                            TAG,
                            "Received AutomationEvent.Paused. Setting _isTaskPaused to true."
                        )
                        _isTaskPaused.value = true

                        Toast.makeText(
                            getApplication(),
                            "Task paused",
                            Toast.LENGTH_LONG
                        ).show()
                    }

                    is AutomationEvent.Resumed -> {
                        runtimeLogger.info(
                            TAG,
                            "Received AutomationEvent.Resumed. Setting _isTaskPaused to false."
                        )
                        _isTaskPaused.value = false
                    }

                    else -> {

                    }
                }
            }
        }
    }
}