package com.coremate.opengui.network.interceptors

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import okhttp3.CacheControl
import okhttp3.Interceptor
import okhttp3.Response
import java.util.concurrent.TimeUnit

/**
 * An interceptor that controls caching behavior.
 * Forces cache usage when offline.
 */
class CacheInterceptor(private val context: Context) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        var request = chain.request()

        if (!isNetworkAvailable()) {
            // If offline, force cache usage
            val cacheControl = CacheControl.Builder()
                .maxStale(7, TimeUnit.DAYS) // Tolerate 7 days old cache
                .build()

            request = request.newBuilder()
                .cacheControl(cacheControl)
                .build()
        }

        return chain.proceed(request)
    }

    private fun isNetworkAvailable(): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // 对于 API 23 (Marshmallow) 及更高版本
            val network = connectivityManager.activeNetwork ?: return false // 获取当前活跃网络
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false // 获取网络能力

            return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) // 考虑 VPN 连接
        } else {
            // 对于旧版本 API
            @Suppress("DEPRECATION") // 抑制对已弃用 API 的警告
            val activeNetworkInfo = connectivityManager.activeNetworkInfo
            @Suppress("DEPRECATION") // 抑制对已弃用 API 的警告
            return activeNetworkInfo != null && activeNetworkInfo.isConnected
        }
    }
}