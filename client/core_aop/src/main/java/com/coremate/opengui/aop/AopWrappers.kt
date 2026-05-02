package com.coremate.opengui.aop

import com.coremate.opengui.aop.utils.ConsoleLogger
import kotlin.system.measureTimeMillis
import com.coremate.opengui.common_jvm.utils.Logger // Import Logger interface.

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
 * Logging wrapper: records block execution time.
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
 * Tracking wrapper: sends an analytics event.
 */
inline fun <T> trackEvent(eventName: String, block: () -> T): T {
    // Call the analytics/tracking SDK here
    runtimeLogger.debug("Analytics", "Tracking event: '$eventName'")
    return block()
}

/**
 * Cache wrapper: execute the block and return the cached result when present and not expired.
 * @param key unique cache key.
 * @param ttl Millis cache duration in milliseconds.
 * @param block code block used to fetch fresh data.
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
