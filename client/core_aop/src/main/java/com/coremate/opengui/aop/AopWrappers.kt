package com.coremate.opengui.aop

import com.coremate.opengui.aop.utils.ConsoleLogger
import kotlin.system.measureTimeMillis
import com.coremate.opengui.common_jvm.utils.Logger // 导入 Logger 接口

public val runtimeLogger: Logger = ConsoleLogger()
object InMemoryCache {
    private val cache = mutableMapOf<String, Pair<Any?, Long>>()

    fun <T> get(key: String): T? {
        val entry = cache[key] ?: return null
        if (System.currentTimeMillis() > entry.second) {
            cache.remove(key)
            return null
        }
        @Suppress("UNCHECKED_CAST")
        return entry.first as? T
    }

    fun set(key: String, value: Any?, ttlMillis: Long) {
        val expiryTime = System.currentTimeMillis() + ttlMillis
        cache[key] = Pair(value, expiryTime)
    }
}

/**
 * 日志包装器：记录代码块执行耗时。
 */
inline fun <T> logExecutionTime(block: () -> T): T {
    val result: T
    val time = measureTimeMillis {
        result = block()
    }

    runtimeLogger.debug("Performance", "Executed in ${time}ms")
    return result
}

/**
 * 埋点包装器：发送一个分析事件。
 */
inline fun <T> trackEvent(eventName: String, block: () -> T): T {
    // 在这里调用您的分析/埋点SDK
    runtimeLogger.debug("Analytics", "Tracking event: '$eventName'")
    return block()
}

/**
 * 缓存包装器：执行代码块，如果结果已在缓存中且未过期，则直接返回缓存结果。
 * @param key 缓存的唯一键。
 * @param ttlMillis 缓存的有效时间（毫秒）。
 * @param block 用于获取新数据的代码块。
 */
suspend fun <T> cacheResult(key: String, ttlMillis: Long, block: suspend () -> T): T {
    val cachedResult: T? = InMemoryCache.get(key)
    if (cachedResult != null) {
        runtimeLogger.debug("Cache", "Cache hit for key: $key")
        return cachedResult
    }

    runtimeLogger.debug("Cache", "Cache miss for key: $key. Fetching new data.")
    val result = block()
    InMemoryCache.set(key, result, ttlMillis)
    return result
}