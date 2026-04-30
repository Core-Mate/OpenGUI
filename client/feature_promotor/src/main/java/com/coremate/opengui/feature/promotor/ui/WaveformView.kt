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

    private val amplitudes = mutableListOf<Float>()
    private var maxAmplitude = 0f
    private var waveColor: Int = Color.WHITE
    private var waveThickness: Float = 2f
    private var waveSpeed: Int = 50

    init {
        val typedArray = context.obtainStyledAttributes(attrs, R.styleable.WaveformView)
        waveColor = typedArray.getColor(R.styleable.WaveformView_waveColor, Color.WHITE)
        waveThickness = typedArray.getDimension(R.styleable.WaveformView_waveThickness, 2f)
        waveSpeed = typedArray.getInt(R.styleable.WaveformView_waveSpeed2, 50)
        typedArray.recycle()

        wavePaint.color = waveColor
        wavePaint.strokeWidth = waveThickness
    }


    fun addAmplitude(amplitude: Int) {


        val normalizedAmplitude = (amplitude / 32767f) * 100f
        amplitudes.add(normalizedAmplitude)


        if (amplitudes.size > width / 2) {
            amplitudes.removeAt(0)
        }


        maxAmplitude = amplitudes.maxOrNull() ?: 0f
        if (maxAmplitude > 100f) maxAmplitude = 100f

        invalidate()
    }


    fun clearAmplitudes() {
        amplitudes.clear()
        maxAmplitude = 0f
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        if (amplitudes.isEmpty()) return

        val centerY = height / 2f
        val maxWaveHeight = (height / 2f) * 0.8f


        for (i in amplitudes.indices) {
            val amplitude = amplitudes[i]

            val scaledAmplitude = if (maxAmplitude > 0) (amplitude / maxAmplitude) * maxWaveHeight else 0f

            val x = i.toFloat() * 2

            canvas.drawLine(x, centerY + scaledAmplitude / 2, x, centerY - scaledAmplitude / 2, wavePaint)
        }
    }
}