package com.coremate.opengui.network.websocket

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collectLatest

/**
 * 待命前台服务
 *
 * 保持 StandbySocketManager 在后台运行，防止系统杀死 WebSocket 连接。
 * App 启动时由 HomeActivity 启动此服务。
 *
 * 当收到远程任务派发时，通过 AutomationEventBus 通知 App 层开始执行。
 */
class StandbyForegroundService : Service() {

    companion object {
        private const val TAG = "StandbyFgService"
        private const val CHANNEL_ID = "standby_channel"
        private const val NOTIFICATION_ID = 3001

        /** 全局 StandbySocketManager 引用，供 App 层访问 */
        var standbyManager: StandbySocketManager? = null
            private set

        fun start(context: Context) {
            val intent = Intent(context, StandbyForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, StandbyForegroundService::class.java))
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("等待远程任务..."))

        standbyManager = StandbySocketManager(applicationContext)
        standbyManager?.connect()

        // 监听 dispatch 事件，转发到 AutomationEventBus
        scope.launch {
            standbyManager?.dispatchFlow?.collectLatest { payload ->
                LogManager.saveLog(applicationContext, TAG,
                    "Dispatching remote task: execution=${payload.executionId}, task=${payload.taskName}", -1)
                AutomationEventBus.publish(
                    AutomationEvent.RemoteDispatch(
                        executionId = payload.executionId,
                        taskId = payload.taskId,
                        taskName = payload.taskName,
                    )
                )
            }
        }

        LogManager.saveLog(applicationContext, TAG, "Standby service started", -1)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        standbyManager?.disconnect()
        standbyManager = null
        LogManager.saveLog(applicationContext, TAG, "Standby service stopped", -1)
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "远程控制待命",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "保持远程任务接收连接"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("OpenGUI")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_send)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
