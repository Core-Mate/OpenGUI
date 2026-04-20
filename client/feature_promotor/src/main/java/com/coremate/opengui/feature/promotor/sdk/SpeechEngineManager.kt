package com.coremate.opengui.feature.promotor.sdk

import android.app.Application
import android.content.Context
import com.coremate.opengui.common.utils.AndroidLogger
import com.coremate.opengui.common_jvm.utils.Logger
import com.bytedance.speech.speechengine.SpeechEngine
import com.bytedance.speech.speechengine.SpeechEngineDefines
import com.bytedance.speech.speechengine.SpeechEngineGenerator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

object SpeechEngineManager : SpeechEngine.SpeechListener {

    private val logger: Logger = AndroidLogger()
    private var speechEngine: SpeechEngine? = null
    private val scope = CoroutineScope(Dispatchers.Default)
    private var isEngineReady = false

    private val _transcriptionResultFlow = MutableSharedFlow<String>()
    val transcriptionResultFlow = _transcriptionResultFlow.asSharedFlow()

    // 在Application的onCreate中调用一次
    fun initialize(context: Context, application: Application) {
        logger.info("SpeechEngineManager", "Preparing SDK environment...")
        SpeechEngineGenerator.PrepareEnvironment(context, application)
    }

    // 在Fragment中调用，传入密钥
    fun setupEngine(
        context: Context,
        appId: String,
        appKey: String,
        token: String
    ) {
        if (speechEngine != null) {
            logger.info("SpeechEngineManager", "Engine already exists. Destroying old one.")
            speechEngine?.destroyEngine()
        }

        logger.info("SpeechEngineManager", "Creating new SpeechEngine instance.")
        speechEngine = SpeechEngineGenerator.getInstance()
        speechEngine?.createEngine()

        // --- 配置参数 ---
        speechEngine?.apply {
            setOptionString(SpeechEngineDefines.PARAMS_KEY_ENGINE_NAME_STRING, SpeechEngineDefines.DIALOG_ENGINE)
            setOptionString(SpeechEngineDefines.PARAMS_KEY_LOG_LEVEL_STRING, SpeechEngineDefines.LOG_LEVEL_TRACE)
            setOptionString(SpeechEngineDefines.PARAMS_KEY_DEBUG_PATH_STRING, context.getExternalFilesDir("logs")?.absolutePath ?: "")

            // 认证信息
            setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_ID_STRING, appId)
            setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_KEY_STRING, appKey)
            setOptionString(SpeechEngineDefines.PARAMS_KEY_APP_TOKEN_STRING, token)
            setOptionString(SpeechEngineDefines.PARAMS_KEY_UID_STRING, "user-promotor-app") // 自定义用户ID

            // 服务信息
            setOptionString(SpeechEngineDefines.PARAMS_KEY_RESOURCE_ID_STRING, "volc.speech.dialog")
            setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_ADDRESS_STRING, "wss://openspeech.bytedance.com")
            setOptionString(SpeechEngineDefines.PARAMS_KEY_DIALOG_URI_STRING, "/api/v3/realtime/dialogue")
        }

        val ret = speechEngine?.initEngine()
        if (ret != SpeechEngineDefines.ERR_NO_ERROR) {
            logger.error("SpeechEngineManager", "Init Engine Failed: $ret")
            isEngineReady = false
            return
        }
        logger.info("SpeechEngineManager", "Engine initialized successfully.")
        speechEngine?.setListener(this)
        isEngineReady = true
    }

    // 开始语音会话
    fun startSession() {
        if (!isEngineReady || speechEngine == null) {
            logger.warn("SpeechEngineManager", "Engine not ready, cannot start session.")
            return
        }
        logger.info("SpeechEngineManager", "Directive: START_ENGINE")
        // bot_name 是必须的，但可以为空
        val startJson = "{\"dialog\":{\"bot_name\":\"\"}}"
        speechEngine?.sendDirective(SpeechEngineDefines.DIRECTIVE_START_ENGINE, startJson)
    }

    // 结束语音会话
    fun stopSession() {
        if (!isEngineReady || speechEngine == null) {
            logger.warn("SpeechEngineManager", "Engine not ready, cannot stop session.")
            return
        }
        logger.info("SpeechEngineManager", "Directive: STOP_ENGINE")
        // 使用同步停止，确保彻底关闭
        speechEngine?.sendDirective(SpeechEngineDefines.DIRECTIVE_SYNC_STOP_ENGINE, "")
    }

    // 销毁引擎
    fun destroy() {
        logger.info("SpeechEngineManager", "Destroying engine.")
        speechEngine?.destroyEngine()
        speechEngine = null
        isEngineReady = false
    }


    override fun onSpeechMessage(type: Int, data: ByteArray, len: Int) {
        val strData = String(data, 0, len)
        when (type) {
            SpeechEngineDefines.MESSAGE_TYPE_ENGINE_START -> {
                logger.info("SpeechEngineManager", "Callback: Engine Started. SessionId: $strData")
            }
            SpeechEngineDefines.MESSAGE_TYPE_DIALOG_ASR_RESPONSE -> {
                logger.info("SpeechEngineManager", "Callback: ASR Result: $strData")
                try {
                    val text = JSONObject(strData)
                        .getJSONArray("results")
                        .getJSONObject(0)
                        .getString("text")

                    if (text.isNotBlank()) {
                        scope.launch {
                            _transcriptionResultFlow.emit(text)
                        }
                    }
                } catch (e: Exception) {
                    logger.error("SpeechEngineManager", "Error parsing ASR JSON", e)
                }
            }
            SpeechEngineDefines.MESSAGE_TYPE_ENGINE_ERROR -> {
                logger.error("SpeechEngineManager", "Callback: Engine Error: $strData")
            }
            SpeechEngineDefines.MESSAGE_TYPE_ENGINE_STOP -> {
                logger.info("SpeechEngineManager", "Callback: Engine Stopped.")
            }
        }
    }
}