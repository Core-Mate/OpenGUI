package com.coremate.opengui.common.sqlite

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class SQLiteManager private constructor(context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE_LOG (
                $COLUMN_TIME TEXT NOT NULL,
                $COLUMN_DATA TEXT NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_LOG")
        onCreate(db)
    }

    fun insertLog(timestamp: Long, json: String): Long {
        val values = ContentValues().apply {
            put(COLUMN_TIME, timestamp)
            put(COLUMN_DATA, json)
        }
        return writableDatabase.insert(TABLE_LOG, null, values)
    }

    @RequiresApi(Build.VERSION_CODES.O)
    fun queryLogs(start: Long, end: Long): List<String> {
        if (start >= end) {
            return emptyList()
        }

        val projection = arrayOf(COLUMN_DATA, COLUMN_TIME)
        val selection = "$COLUMN_TIME BETWEEN ? AND ?"
        val selectionArgs = arrayOf(start.toString(), end.toString())

        val cursor = readableDatabase.query(
            TABLE_LOG,
            projection,
            selection,
            selectionArgs,
            null,
            null,
            "$COLUMN_TIME ASC"
        )

        Log.d(TAG, "queryLogs: -------->${cursor.count}")

        return cursor.use {
            val timeIndex = it.getColumnIndexOrThrow(COLUMN_TIME)
            val dataIndex = it.getColumnIndexOrThrow(COLUMN_DATA)
            buildList {
                while (it.moveToNext()) {
                    val time = it.getString(timeIndex)
                    add(timestampMsToBeijing(time) + " | " + it.getString(dataIndex))
                }
            }
        }
    }

    fun queryLogs(content: String): List<String> {
        val resultList = mutableListOf<String>()

        // 1. 定位：找到符合条件的记录，并获取其时间戳（或ID）作为锚点
        // 我们直接查最后 2 条记录
        val anchorTime = readableDatabase.query(
            TABLE_LOG,
            arrayOf(COLUMN_TIME), // 只取时间戳列
            "$COLUMN_DATA = ?",
            arrayOf(content),
            null, null,
            "$COLUMN_TIME DESC", // 按时间倒序
            "2"                  // 取最近的两条
        ).use { cursor ->
            if (cursor.moveToLast()) {
                // 如果只有 1 条，moveToLast 会停在第 1 条
                // 如果有 2 条，moveToLast 会停在第 2 条（即倒数第二条）
                cursor.getLong(0)
            } else {
                -1L // 一条都没有
            }
        }

        if (anchorTime == -1L) return emptyList()

        // 2. 切片：查询在该时间点之后（不包含该点本身）的所有数据
        readableDatabase.query(
            TABLE_LOG,
            arrayOf(COLUMN_DATA),
            "$COLUMN_TIME >= ?",
            arrayOf(anchorTime.toString()),
            null, null,
            "$COLUMN_TIME ASC" // 结果按时间正序排列
        ).use { cursor ->
            val dataIndex = cursor.getColumnIndexOrThrow(COLUMN_DATA)
            while (cursor.moveToNext()) {
                resultList.add(cursor.getString(dataIndex))
            }
        }

        return resultList
    }

    /** 返回日志总条数 */
    fun getLogCount(): Long {
        val cursor = readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM $TABLE_LOG",
            null
        )
        return cursor.use {
            if (it.moveToFirst()) it.getLong(0) else 0L
        }
    }

    /** 返回日志时间范围 [最早时间戳, 最晚时间戳]，无数据时返回 null to null */
    fun getLogTimeRange(): Pair<Long?, Long?> {
        val cursor = readableDatabase.rawQuery(
            "SELECT MIN(CAST($COLUMN_TIME AS INTEGER)), MAX(CAST($COLUMN_TIME AS INTEGER)) FROM $TABLE_LOG",
            null
        )
        return cursor.use {
            if (it.moveToFirst() && !it.isNull(0) && !it.isNull(1)) {
                Pair(it.getLong(0), it.getLong(1))
            } else {
                Pair(null, null)
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    fun timestampMsToBeijing(timestampStr: String): String {
        val timestamp = timestampStr.toLong()
        // 区分秒和毫秒
        val instant = if (timestamp > 1_000_000_000_000L) {
            // 毫秒时间戳（13位）
            Instant.ofEpochMilli(timestamp)
        } else {
            // 秒时间戳（10位）
            Instant.ofEpochSecond(timestamp)
        }
        val beijingTime = instant.atZone(ZoneId.of("Asia/Shanghai"))
        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
        return beijingTime.format(formatter)
    }

    companion object {
        private const val TAG = "SQLiteManager"
        private const val DATABASE_NAME = "haomai.db"
        private const val DATABASE_VERSION = 1

        const val TABLE_LOG = "Log"
        const val COLUMN_TIME = "time"
        const val COLUMN_DATA = "data"

        @Volatile
        private var instance: SQLiteManager? = null

        fun getInstance(context: Context): SQLiteManager {
            return instance ?: synchronized(this) {
                instance ?: SQLiteManager(context.applicationContext).also { instance = it }
            }
        }
    }
}