package com.coremate.opengui.feature.promotor.ui.mine.setting

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import com.github.gzuliyujiang.wheelpicker.DatimePicker
import com.github.gzuliyujiang.wheelpicker.annotation.DateMode
import com.github.gzuliyujiang.wheelpicker.annotation.TimeMode
import com.github.gzuliyujiang.wheelpicker.entity.DatimeEntity
import com.coremate.opengui.common.push.PushManager
import com.coremate.opengui.common.sqlite.SQLiteManager
import com.coremate.opengui.feature.promotor.databinding.ActivityLogBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.feature.promotor.ui.base.context
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Calendar

class LogActivity() :
    BaseBindingActivity<ActivityLogBinding>(ActivityLogBinding::inflate) {
    override fun initView() {
    }

    @RequiresApi(Build.VERSION_CODES.O)
    override fun initEvent() {
        binding.btSetTimeRange.setOnClickListener {
            showTimePicker()
        }

        binding.btShareFile.setOnClickListener {
            shareFileToWeChat()
        }

        binding.btSaveFile.setOnClickListener {
            saveFileToDownload()
        }

        binding.btOneHour.setOnClickListener {
            val endTime = System.currentTimeMillis()
            val startTime = endTime - 3600 * 1000L
            PushManager.instance.uploadLogs(startTime, endTime)
        }

        binding.btThreeHour.setOnClickListener {
            val endTime = System.currentTimeMillis()
            val startTime = endTime - 3 * 3600 * 1000L
            PushManager.instance.uploadLogs(startTime, endTime)
        }

        binding.btFiveHour.setOnClickListener {
            val endTime = System.currentTimeMillis()
            val startTime = endTime - 5 * 3600 * 1000L
            PushManager.instance.uploadLogs(startTime, endTime)
        }
        binding.accessibilityLog.setOnClickListener {
            PushManager.instance.uploadAccessibilityLogs()
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    override fun initParam() {
        val db = SQLiteManager.getInstance(PushManager.Companion.applicationContext)
        val totalCount = db.getLogCount()
        val (minTime, maxTime) = db.getLogTimeRange()

        val timeRangeStr = when {
            minTime != null && maxTime != null -> {
                val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                val zone = ZoneId.of("Asia/Shanghai")
                fun formatTs(ts: Long): String {
                    val instant = if (ts > 1_000_000_000_000L) Instant.ofEpochMilli(ts) else Instant.ofEpochSecond(ts)
                    return instant.atZone(zone).format(formatter)
                }
                "${formatTs(minTime)} — ${formatTs(maxTime)}"
            }
            else -> "No logs yet"
        }
        binding.tvDesc.text = "Total ${totalCount} logs\nTime Range：$timeRangeStr"
    }

    private var startTime: Long = -1L
    private var endTime: Long = -1L

    @RequiresApi(Build.VERSION_CODES.O)
    fun showTimePicker() {
        val picker = DatimePicker(this)
        if (startTime == -1L) {
            picker.setTitle("Set Start Time")
        } else {
            picker.setTitle("Set End Time")
        }
        val wheelLayout = picker.getWheelLayout()
        picker.setOnDatimePickedListener { year, month, day, hour, minute, second ->
            val calendar = Calendar.getInstance()
            calendar.set(Calendar.YEAR, year)
            calendar.set(Calendar.MONTH, month - 1)
            calendar.set(Calendar.DAY_OF_MONTH, day)
            calendar.set(Calendar.HOUR_OF_DAY, hour)
            calendar.set(Calendar.MINUTE, minute)
            calendar.set(Calendar.SECOND, second)
            if (startTime == -1L) {
                startTime = calendar.time.time
                binding.tvTimeRange.text = "Start time  " +
                        year.toString() + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second
                showTimePicker()
            } else {
                endTime = calendar.time.time
                binding.tvTimeRange.text = "End time  " +
                        year.toString() + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second
                PushManager.instance.uploadLogs(startTime, endTime)
                startTime = -1L
                endTime = -1L
            }
        }
        wheelLayout.setDateMode(DateMode.YEAR_MONTH_DAY)
        wheelLayout.setTimeMode(TimeMode.HOUR_24_NO_SECOND)
        wheelLayout.setRange(DatimeEntity.monthOnFuture(-1), DatimeEntity.now())

        wheelLayout.setDateLabel("Year", "Month", "Day")
        wheelLayout.setTimeLabel("Hour", "Minute", "Second")
        picker.show()
    }

    private fun shareFileToWeChat() {
        try {

            val logFileName = "push_log.txt"
            val logFile = File(context.filesDir?.absolutePath + "/push_logs", logFileName)
            if (!logFile.absoluteFile.exists()) {
                logFile.absoluteFile.mkdirs()
            }

            if (!logFile.exists()) {
                Toast.makeText(context, "File not found", Toast.LENGTH_SHORT).show()
                return
            }


            val fileUri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                logFile
            )


            val mimeType = when (logFile.extension.lowercase()) {
                "txt" -> "text/plain"
                "jpg", "jpeg" -> "image/jpeg"
                "png" -> "image/png"
                "pdf" -> "application/pdf"
                else -> "*/*"
            }

            // CreateShare Intent
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, fileUri)
                putExtra(Intent.EXTRA_TEXT, "Share File: ${logFile.name}")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }


            startActivity(Intent.createChooser(shareIntent, "Share File to WeChat"))
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Share failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveFileToDownload() {
        try {

            val logFileName = "push_log.txt"
            val logFile = File(context.filesDir?.absolutePath + "/push_logs", logFileName)


            if (!logFile.exists()) {
                logFile.parentFile.absoluteFile.mkdirs()
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {

                saveFileToDownloadUsingMediaStore(logFile)
            } else {

                saveFileToDownloadLegacy(logFile)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Save failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun saveFileToDownloadUsingMediaStore(sourceFile: File) {
        try {
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, sourceFile.name)
                put(MediaStore.MediaColumns.MIME_TYPE, "text/plain")
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            }

            val resolver = contentResolver
            val uri = resolver.insert(MediaStore.Files.getContentUri("external"), contentValues)

            if (uri != null) {
                resolver.openOutputStream(uri)?.use { outputStream ->
                    FileInputStream(sourceFile).use { inputStream ->
                        inputStream.copyTo(outputStream)
                    }
                }
                Toast.makeText(context, "File saved to Downloads", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Save failed: could not create file", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Save failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveFileToDownloadLegacy(sourceFile: File) {
        try {
            val downloadDir =
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)


            if (!downloadDir.exists()) {
                downloadDir.mkdirs()
            }

            val targetFile = File(downloadDir, sourceFile.name)


            FileInputStream(sourceFile).use { inputStream ->
                FileOutputStream(targetFile).use { outputStream ->
                    inputStream.copyTo(outputStream)
                }
            }

            Toast.makeText(
                context,
                "File saved to Downloads: ${targetFile.absolutePath}",
                Toast.LENGTH_SHORT
            ).show()
        } catch (e: IOException) {
            e.printStackTrace()
            Toast.makeText(context, "Save failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

}