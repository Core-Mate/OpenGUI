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

        // 1. Locate matching records and use their timestamp (or ID) as the anchor
        // Query the last 2 records directly
        val anchorTime = readableDatabase.query(
            TABLE_LOG,
            arrayOf(COLUMN_TIME), // Read only the timestamp column.
            "$COLUMN_DATA = ?",
            arrayOf(content),
            null, null,
            "$COLUMN_TIME DESC", // Sort by time descending.
            "2"                  // Read the two most recent rows.
        ).use { cursor ->
            if (cursor.moveToLast()) {
                // With only 1 record, move ToLast stops at the first record
                // With 2 records, move ToLast stops at the second record, i.e. the penultimate one
                cursor.getLong(0)
            } else {
                -1L // No rows.
            }
        }

        if (anchorTime == -1L) return emptyList()

        // 2. Slice: query all data after that timestamp, excluding the anchor itself
        readableDatabase.query(
            TABLE_LOG,
            arrayOf(COLUMN_DATA),
            "$COLUMN_TIME >= ?",
            arrayOf(anchorTime.toString()),
            null, null,
            "$COLUMN_TIME ASC" // Return results in ascending time order.
        ).use { cursor ->
            val dataIndex = cursor.getColumnIndexOrThrow(COLUMN_DATA)
            while (cursor.moveToNext()) {
                resultList.add(cursor.getString(dataIndex))
            }
        }

        return resultList
    }

 /** Return total log row count */
    fun getLogCount(): Long {
        val cursor = readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM $TABLE_LOG",
            null
        )
        return cursor.use {
            if (it.moveToFirst()) it.getLong(0) else 0L
        }
    }

 /** Return log time range [earliest timestamp, latest timestamp], or null to null when there is no data */
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
        // Distinguish seconds from milliseconds
        val instant = if (timestamp > 1_000_000_000_000L) {
            // Millisecond timestamp (13 digits)
            Instant.ofEpochMilli(timestamp)
        } else {
            // Second timestamp (10 digits)
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
