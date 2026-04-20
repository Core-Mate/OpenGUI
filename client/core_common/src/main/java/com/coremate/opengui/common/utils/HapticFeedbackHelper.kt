package com.coremate.opengui.common.utils

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Haptic feedback helper for triggering vibration patterns across the app.
 *
 * Patterns:
 * - lightTap: 10ms (dynamic island click, card click)
 * - click: 30ms (pause/resume confirmation)
 * - confirm: 80ms (terminate confirmation, submit supplement)
 * - success: 50ms (task completed)
 * - error: triple-tap 100-50-100-50-100ms (task failed)
 * - alert: double-tap 200-100-200ms (call_user arrived)
 */
object HapticFeedbackHelper {

    private fun getVibrator(context: Context): Vibrator? {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            manager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        return vibrator?.takeIf { it.hasVibrator() }
    }

    /** Single vibration with given duration. */
    fun vibrate(context: Context, durationMillis: Long) {
        val vibrator = getVibrator(context) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(
                VibrationEffect.createOneShot(durationMillis, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(durationMillis)
        }
    }

    /** Pattern vibration: timings alternate between off/on durations, starting with off. */
    private fun vibratePattern(context: Context, timings: LongArray, amplitudes: IntArray? = null) {
        val vibrator = getVibrator(context) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = if (amplitudes != null) {
                VibrationEffect.createWaveform(timings, amplitudes, -1)
            } else {
                VibrationEffect.createWaveform(timings, -1)
            }
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(timings, -1)
        }
    }

    /** 10ms - dynamic island click, card click */
    fun lightTap(context: Context) = vibrate(context, 10)

    /** 30ms - pause/resume state toggle */
    fun click(context: Context) = vibrate(context, 30)

    /** 80ms - destructive action confirmation (terminate task) */
    fun confirm(context: Context) = vibrate(context, 80)

    /** 50ms - task completed successfully */
    fun success(context: Context) = vibrate(context, 50)

    /** Triple-tap: 100-50-100-50-100ms - task failed / error */
    fun error(context: Context) {
        // timings: [off, on, off, on, off, on]
        vibratePattern(context, longArrayOf(0, 100, 50, 100, 50, 100))
    }

    /** Double-tap: 200-100-200ms - call_user arrived, needs attention */
    fun alert(context: Context) {
        // timings: [off, on, off, on]
        vibratePattern(context, longArrayOf(0, 200, 100, 200))
    }
}
