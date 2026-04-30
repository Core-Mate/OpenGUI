package com.coremate.opengui.accessibility.feedback

interface ClickFeedbackProvider {
    /**
     */
    fun showClickIndicator(x: Float, y: Float, durationMillis: Long)
    fun hideClickIndicator()
}