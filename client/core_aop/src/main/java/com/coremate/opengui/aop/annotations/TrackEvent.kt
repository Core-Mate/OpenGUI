package com.coremate.opengui.aop.annotations

/**
 * 标记一个方法或代码块，表示其需要被追踪（埋点）。
 * @param eventName 事件的唯一名称。
 */
@Target(AnnotationTarget.FUNCTION, AnnotationTarget.TYPE, AnnotationTarget.CLASS)
@Retention(AnnotationRetention.SOURCE)
annotation class TrackEvent(val eventName: String)