package com.coremate.opengui.feature.promotor.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import com.coremate.opengui.feature.promotor.R

class WaveformView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val wavePaint: Paint = Paint().apply {
        isAntiAlias = true
        style = Paint.Style.STROKE
    }

    private val amplitudes = mutableListOf<Float>() // 存储音频振幅数据 (0-100范围)
    private var maxAmplitude = 0f // 当前最大振幅，用于归一化
    private var waveColor: Int = Color.WHITE
    private var waveThickness: Float = 2f // 波形线粗细
    private var waveSpeed: Int = 50 // 波形移动速度，越大越快

    init {
        val typedArray = context.obtainStyledAttributes(attrs, R.styleable.WaveformView)
        waveColor = typedArray.getColor(R.styleable.WaveformView_waveColor, Color.WHITE)
        waveThickness = typedArray.getDimension(R.styleable.WaveformView_waveThickness, 2f)
        waveSpeed = typedArray.getInt(R.styleable.WaveformView_waveSpeed2, 50)
        typedArray.recycle()

        wavePaint.color = waveColor
        wavePaint.strokeWidth = waveThickness
    }

    // 更新振幅数据
    fun addAmplitude(amplitude: Int) {
        // 将原始振幅转换为0-100范围，并加入列表
        // 假设 amplitude 原始范围是 0 到 32767 (short 的最大值)
        val normalizedAmplitude = (amplitude / 32767f) * 100f
        amplitudes.add(normalizedAmplitude)

        // 限制列表大小，只保留最新的波形数据，形成“移动”效果
        if (amplitudes.size > width / 2) { // 根据宽度调整保留多少点
            amplitudes.removeAt(0)
        }

        // 找到当前最大振幅用于归一化
        maxAmplitude = amplitudes.maxOrNull() ?: 0f
        if (maxAmplitude > 100f) maxAmplitude = 100f // 限制最大值

        invalidate() // 请求重绘
    }

    // 清除波形
    fun clearAmplitudes() {
        amplitudes.clear()
        maxAmplitude = 0f
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        if (amplitudes.isEmpty()) return

        val centerY = height / 2f
        val maxWaveHeight = (height / 2f) * 0.8f // 波形最大高度占可用空间80%

        // 绘制波形
        for (i in amplitudes.indices) {
            val amplitude = amplitudes[i]
            // 归一化振幅，使其适应视图高度
            val scaledAmplitude = if (maxAmplitude > 0) (amplitude / maxAmplitude) * maxWaveHeight else 0f

            val x = i.toFloat() * 2 // 每个点之间的间距
            // 绘制对称波形
            canvas.drawLine(x, centerY + scaledAmplitude / 2, x, centerY - scaledAmplitude / 2, wavePaint)
        }
    }
}