package com.coremate.opengui.automation.biz.common.foreground

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.coremate.opengui.automation.AMServiceManager
import com.coremate.opengui.automation.R

class AMForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "promotor1"
        const val CHANNEL_NAME = "运行服务"
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createNotificationChannel(1)
        return super.onStartCommand(intent, flags, startId)
    }

    private fun createNotificationChannel(noticeId: Int) {
        val launchIntent = packageManager.getLaunchIntentForPackage(
            packageName
        )
        val pendingIntent =
            PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE)

        //TODO:8.0以上增加频道
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val b = NotificationChannel(
                CHANNEL_ID + noticeId,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            )
            val mNotificationManager =
                getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            mNotificationManager.createNotificationChannel(b)
        }
        val title = "Promotor"
        val mBuilder = NotificationCompat.Builder(this, CHANNEL_ID + noticeId)
        mBuilder.setContentTitle(title) //设置通知栏标题
            .setContentText("")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setNumber(0) //设置通知集合的数量
            .setSound(null)
            .setSmallIcon(
                AMServiceManager.instance.notificationImg ?: R.drawable.notification_small_icon
            )
            .setLights(0, 0, 0)
            .setTicker(title) //通知首次出现在通知栏，带上升动画效果的
            .setWhen(System.currentTimeMillis()) //通知产生的时间，会在通知信息里显示，一般是系统获取到的时间
            .setVibrate(longArrayOf(0L))
        try {
            startForeground(noticeId, mBuilder.build())
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopForeground(true)
        stopSelf()
    }

    override fun onBind(p0: Intent?): IBinder? {
        return null
    }

}