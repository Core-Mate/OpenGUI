package com.coremate.opengui.login

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ObjectAnimator
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.coremate.opengui.R
import com.coremate.opengui.feature.promotor.ui.home.HomeActivity
import com.tencent.mmkv.MMKV

/**
 * 闪屏页
 *
 * Open-source version: authentication is bypassed.
 * The app navigates directly to HomeActivity.
 * To connect to a real backend, set BETTER_AUTH_SECRET in server/.env and obtain
 * a token via the /api/user-auth/send-otp + /api/user-auth/verify-otp endpoints,
 * then store it in MMKV under the key "token".
 */
class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            installSplashScreen()
        }
        setTheme(R.style.AppTheme)
        super.onCreate(savedInstanceState)

        val mmkv = MMKV.defaultMMKV()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            splashScreen.setOnExitAnimationListener { splashScreenView ->
                val slideUp = ObjectAnimator.ofFloat(
                    splashScreenView,
                    View.TRANSLATION_Y,
                    0f,
                    -splashScreenView.height.toFloat()
                )
                slideUp.duration = 2000
                slideUp.addListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        splashScreenView.remove()
                    }
                })
                slideUp.start()
            }
        }

        mmkv.encode("LastLoginTime", System.currentTimeMillis())
        // Skip authentication in open-source version - go directly to HomeActivity
        startActivity(Intent(this@SplashActivity, HomeActivity::class.java))
        finish()
    }

    fun getVersionCode(context: Context): Long {
        return try {
            val packageInfo =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.packageManager.getPackageInfo(
                        context.packageName,
                        PackageManager.PackageInfoFlags.of(0)
                    )
                } else {
                    @Suppress("DEPRECATION")
                    context.packageManager.getPackageInfo(context.packageName, 0)
                }
            packageInfo.versionCode.toLong()
        } catch (e: PackageManager.NameNotFoundException) {
            e.printStackTrace()
            -1L
        }
    }
}
