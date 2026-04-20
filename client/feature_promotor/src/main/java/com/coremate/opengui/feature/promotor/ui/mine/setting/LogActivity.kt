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
            else -> "暂无日志"
        }
        binding.tvDesc.text = "共有 ${totalCount} 条日志\n时间范围：$timeRangeStr"
    }

    private var startTime: Long = -1L
    private var endTime: Long = -1L

    @RequiresApi(Build.VERSION_CODES.O)
    fun showTimePicker() {
        val picker = DatimePicker(this)
        if (startTime == -1L) {
            picker.setTitle("设置 开始 时间")
        } else {
            picker.setTitle("设置 结束 时间")
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
                binding.tvTimeRange.text = "开始时间  " +
                        year.toString() + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second
                showTimePicker()
            } else {
                endTime = calendar.time.time
                binding.tvTimeRange.text = "结束时间  " +
                        year.toString() + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second
                PushManager.instance.uploadLogs(startTime, endTime)
                startTime = -1L
                endTime = -1L
            }
        }
        wheelLayout.setDateMode(DateMode.YEAR_MONTH_DAY)
        wheelLayout.setTimeMode(TimeMode.HOUR_24_NO_SECOND)
        wheelLayout.setRange(DatimeEntity.monthOnFuture(-1), DatimeEntity.now())

        wheelLayout.setDateLabel("年", "月", "日")
        wheelLayout.setTimeLabel("时", "分", "秒")
        picker.show()
    }

    private fun shareFileToWeChat() {
        try {
            // 查找最新的日志文件
            val logFileName = "push_log.txt"
            val logFile = File(context.filesDir?.absolutePath + "/push_logs", logFileName)
            if (!logFile.absoluteFile.exists()) {
                logFile.absoluteFile.mkdirs()
            }
            // 如果今天的日志文件不存在，尝试查找其他日志文件
            if (!logFile.exists()) {
                Toast.makeText(context, "文件不存在", Toast.LENGTH_SHORT).show()
                return
            }

            // 使用 FileProvider 获取文件 URI
            val fileUri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                logFile
            )

            // 根据文件扩展名确定 MIME 类型
            val mimeType = when (logFile.extension.lowercase()) {
                "txt" -> "text/plain"
                "jpg", "jpeg" -> "image/jpeg"
                "png" -> "image/png"
                "pdf" -> "application/pdf"
                else -> "*/*"
            }

            // 创建分享 Intent
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, fileUri)
                putExtra(Intent.EXTRA_TEXT, "分享文件: ${logFile.name}")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            // 启动分享
            startActivity(Intent.createChooser(shareIntent, "分享文件到微信"))
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "分享失败: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveFileToDownload() {
        try {
            // 查找日志文件
            val logFileName = "push_log.txt"
            val logFile = File(context.filesDir?.absolutePath + "/push_logs", logFileName)

            // 检查文件是否存在
            if (!logFile.exists()) {
                logFile.parentFile.absoluteFile.mkdirs()
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10 (API 29) 及以上使用 MediaStore API
                saveFileToDownloadUsingMediaStore(logFile)
            } else {
                // Android 10 以下使用传统方式
                saveFileToDownloadLegacy(logFile)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "保存失败: ${e.message}", Toast.LENGTH_SHORT).show()
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
                Toast.makeText(context, "文件已保存到下载目录", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "保存失败: 无法创建文件", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "保存失败: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveFileToDownloadLegacy(sourceFile: File) {
        try {
            val downloadDir =
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)

            // 确保目录存在
            if (!downloadDir.exists()) {
                downloadDir.mkdirs()
            }

            val targetFile = File(downloadDir, sourceFile.name)

            // 复制文件
            FileInputStream(sourceFile).use { inputStream ->
                FileOutputStream(targetFile).use { outputStream ->
                    inputStream.copyTo(outputStream)
                }
            }

            Toast.makeText(
                context,
                "文件已保存到下载目录: ${targetFile.absolutePath}",
                Toast.LENGTH_SHORT
            ).show()
        } catch (e: IOException) {
            e.printStackTrace()
            Toast.makeText(context, "保存失败: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

}