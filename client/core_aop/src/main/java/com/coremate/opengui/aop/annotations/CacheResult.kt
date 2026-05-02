package com.coremate.opengui.aop.annotations

import kotlin.time.DurationUnit

/**
 * Marks a method whose result can be cached.
 * @param key unique cache key. Generated automatically when empty.
 * @param ttl cache time to live.
 * @param unit cache duration unit.
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.SOURCE)
annotation class CacheResult(
    val key: String = "",
    val ttl: Long,
    val unit: DurationUnit = DurationUnit.SECONDS
)