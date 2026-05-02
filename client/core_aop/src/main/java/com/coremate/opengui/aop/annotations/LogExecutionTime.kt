package com.coremate.opengui.aop.annotations

/**
 * Marks a method or code block whose execution time should be recorded.
 */
@Target(AnnotationTarget.FUNCTION, AnnotationTarget.TYPE, AnnotationTarget.CLASS)
@Retention(AnnotationRetention.SOURCE)
annotation class LogExecutionTime