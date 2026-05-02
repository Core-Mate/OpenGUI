package com.coremate.opengui.aop.annotations

/**
 * Marks a method or code block that should be tracked for analytics.
 * @param event Name unique event name.
 */
@Target(AnnotationTarget.FUNCTION, AnnotationTarget.TYPE, AnnotationTarget.CLASS)
@Retention(AnnotationRetention.SOURCE)
annotation class TrackEvent(val eventName: String)