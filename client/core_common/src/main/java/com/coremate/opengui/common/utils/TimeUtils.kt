package com.coremate.opengui.common.utils

import android.content.Context
import com.jakewharton.threetenabp.AndroidThreeTen
import org.threeten.bp.Instant
import org.threeten.bp.ZoneId
import org.threeten.bp.ZonedDateTime
import org.threeten.bp.format.DateTimeFormatter

object TimeUtils {

    fun init(context: Context) {
        AndroidThreeTen.init(context)
    }

    private val beijingFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

    private val utcFormatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")

    fun utcToTimestamp(utcTimeString: String): Long {
        return try {
            Instant.parse(utcTimeString).toEpochMilli()
        } catch (e: Exception) {
            e.printStackTrace()
            -1
        }
    }

    fun timestampToUtc(timestamp: Long): String? {
        return try {
            val instant = Instant.ofEpochMilli(timestamp)
            utcFormatter.format(instant)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    fun timestampToZoneTime(timestamp: Long, zoneId: String = "Asia/Shanghai"): String? {
        return try {
            val instant = Instant.ofEpochMilli(timestamp)
            val zonedDateTime = ZonedDateTime.ofInstant(instant, ZoneId.of(zoneId))
            DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(zonedDateTime)
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    fun convertUtcToBeijing(utcString: String?): String {
        val utcTime = ZonedDateTime.parse(utcString)
        val beijingZone = ZoneId.of("Asia/Shanghai")
        val beijingTime = utcTime.withZoneSameInstant(beijingZone)
        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
        return beijingTime.format(formatter)
    }

    /**
 * For execution record lists: return the Beijing-date portion as yyyy-MM-dd, aligned with web.
     */
    fun getHistoryDatePart(utcString: String?): String {
        if (utcString.isNullOrBlank()) return ""
        return try {
            val full = convertUtcToBeijing(utcString)
            if (full.length >= 10) full.substring(0, 10) else full
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    /**
 * For execution record lists: compute duration from start/end time in the same format as web, such as "2m 30s" or "45s".
     */
    fun getHistoryDuration(startedAt: String?, finishedAt: String?): String {
        if (startedAt.isNullOrBlank() || finishedAt.isNullOrBlank()) return ""
        return try {
            val startMs = Instant.parse(startedAt).toEpochMilli()
            val endMs = Instant.parse(finishedAt).toEpochMilli()
            val diffSec = (endMs - startMs) / 1000
            val mins = (diffSec / 60).toInt()
            val secs = (diffSec % 60).toInt()
            if (mins > 0) "${mins}m ${secs}s" else "${secs}s"
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    // Extension functions
    fun String.toTimestamp(): Long = utcToTimestamp(this)
    fun Long.toUtcString(): String? = timestampToUtc(this)
    fun Long.toBeijingUtcString(): String? = timestampToZoneTime(this)
}