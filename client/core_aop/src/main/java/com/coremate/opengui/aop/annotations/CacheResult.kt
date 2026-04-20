package com.coremate.opengui.aop.annotations

import kotlin.time.DurationUnit

/**
 * 标记一个方法，表示其结果可以被缓存。
 * @param key 缓存的唯一键。如果为空，将自动生成。
 * @param ttl (Time to Live) 缓存的有效时间。
 * @param unit 缓存有效时间的单位。
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.SOURCE)
annotation class CacheResult(
    val key: String = "",
    val ttl: Long,
    val unit: DurationUnit = DurationUnit.SECONDS
)