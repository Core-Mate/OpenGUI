package com.coremate.opengui.accessibility.feedback

interface ClickFeedbackProvider {
    /**
     * 在屏幕上指定坐标显示一个点击指示器。
     * @param x 屏幕X坐标
     * @param y 屏幕Y坐标
     * @param durationMillis 指示器显示时长 (ms)
     */
    fun showClickIndicator(x: Float, y: Float, durationMillis: Long)
    fun hideClickIndicator()
}