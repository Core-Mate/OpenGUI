package com.coremate.opengui.common.log

import android.content.Context
import android.os.Environment
import android.util.Log
import com.coremate.opengui.common.sqlite.SQLiteManager
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale


object LogManager {
    private const val TAG = "LogUtil"
    private const val LOG_FILE_PREFIX = "Promotor_log_"
    private const val LOG_FILE_SUFFIX = ".txt"
    private var currentLogFile: File? = null
    private var currentDate: String? = null

    fun saveLog(context: Context, tag: String, message: String, executionId: Int) {
        try {
            SQLiteManager.Companion.getInstance(context)
                .insertLog(System.currentTimeMillis(), message)
            Log.d(tag, message)
            // 检查是否需要创建新的日志文件（基于日期）
            checkAndCreateLogFile()
            // 如果当前日志文件为空，则返回
            if (currentLogFile == null) {
                Log.e(TAG, "Failed to create log file")
                return
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun checkAndCreateLogFile() {
        val today = SimpleDateFormat("MM_dd", Locale.getDefault()).format(Date())
        // 如果日期发生变化或文件不存在，创建新的日志文件
        if (currentDate != today || currentLogFile == null || !currentLogFile!!.exists()) {
            currentDate = today
            val fileName = "$LOG_FILE_PREFIX$today$LOG_FILE_SUFFIX"
            // 获取 Download 目录
            val downloadDir =
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            // 确保目录存在
            if (!downloadDir.exists()) {
                downloadDir.mkdirs()
            }
            currentLogFile = File(downloadDir, fileName)
        }
    }

    // 提供一个方法来设置 Context（在实际使用中需要调用此方法）
    fun init() {
        // 初始化时立即检查并创建日志文件
        checkAndCreateLogFile()
    }
}
