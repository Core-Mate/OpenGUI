package com.coremate.opengui.feature.promotor.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.util.AttributeSet
import android.view.View

class ChartView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var dataPoints: List<Float> = emptyList()
    private val linePaint = Paint().apply {
        color = Color.parseColor("#FFCC80") // Orange color from the screenshot
        style = Paint.Style.STROKE
        strokeWidth = 4f // Line thickness
        isAntiAlias = true
    }
    private val fillPaint = Paint().apply {
        color = Color.parseColor("#15FFCC80") // Light orange for the fill area
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    fun setData(data: List<Float>) {
        this.dataPoints = data
        invalidate() // Redraw the view
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        if (dataPoints.isEmpty()) {
            return
        }

        val width = width.toFloat()
        val height = height.toFloat()

        val path = Path()
        val fillPath = Path()

        // Calculate scaling factors
        val minData = dataPoints.minOrNull() ?: 0f
        val maxData = dataPoints.maxOrNull() ?: 1f
        val dataRange = maxData - minData

        if (dataRange == 0f) { // Handle case where all data points are the same
            val y = height * 0.5f
            path.moveTo(0f, y)
            path.lineTo(width, y)
            fillPath.moveTo(0f, height)
            fillPath.lineTo(0f, y)
            fillPath.lineTo(width, y)
            fillPath.lineTo(width, height)
            fillPath.close()
        } else {
            val xStep = width / (dataPoints.size - 1).toFloat()

            // Move to the first point
            val firstY = height - ((dataPoints[0] - minData) / dataRange) * height
            path.moveTo(0f, firstY)
            fillPath.moveTo(0f, height) // Start fill path from bottom left
            fillPath.lineTo(0f, firstY) // Move up to the first data point

            // Draw subsequent points
            for (i in 1 until dataPoints.size) {
                val x = i * xStep
                val y = height - ((dataPoints[i] - minData) / dataRange) * height
                path.lineTo(x, y)
                fillPath.lineTo(x, y) // Add points to fill path
            }

            fillPath.lineTo(width, height) // Move to bottom right
            fillPath.close() // Close the fill path
        }


        canvas.drawPath(fillPath, fillPaint)
        canvas.drawPath(path, linePaint)
    }
}