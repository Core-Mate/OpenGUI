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
            // Check whether a new log file should be created based on date
            checkAndCreateLogFile()
            // Return if the current log file is empty
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
        // Create a new log file when the date changes or the file is missing
        if (currentDate != today || currentLogFile == null || !currentLogFile!!.exists()) {
            currentDate = today
            val fileName = "$LOG_FILE_PREFIX$today$LOG_FILE_SUFFIX"
            // Get the Download directory
            val downloadDir =
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            // Ensure the directory exists
            if (!downloadDir.exists()) {
                downloadDir.mkdirs()
            }
            currentLogFile = File(downloadDir, fileName)
        }
    }

    // Provide a method for setting Context; callers must invoke it in real use
    fun init() {
        // Check and create the log file immediately during initialization
        checkAndCreateLogFile()
    }
}
