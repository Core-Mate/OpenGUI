package com.coremate.opengui.aop.annotations

/**
 * 标记一个方法或代码块，表示需要记录其执行耗时。
 */
@Target(AnnotationTarget.FUNCTION, AnnotationTarget.TYPE, AnnotationTarget.CLASS)
@Retention(AnnotationRetention.SOURCE)
annotation class LogExecutionTime