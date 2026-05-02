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

        //TODO: add channel support on Android 8.0+
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
        mBuilder.setContentTitle(title) // Set notification title.
            .setContentText("")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setNumber(0) // Set notification collection count.
            .setSound(null)
            .setSmallIcon(
                AMServiceManager.instance.notificationImg ?: R.drawable.notification_small_icon
            )
            .setLights(0, 0, 0)
            .setTicker(title) // First ticker text shown with the notification animation.
            .setWhen(System.currentTimeMillis()) // Notification creation time shown in notification details.
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
