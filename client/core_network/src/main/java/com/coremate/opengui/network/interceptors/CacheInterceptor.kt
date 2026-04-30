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

            val network = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false

            return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        } else {

            @Suppress("DEPRECATION") // Suppress deprecated API warning.
            val activeNetworkInfo = connectivityManager.activeNetworkInfo
            @Suppress("DEPRECATION") // Suppress deprecated API warning.
            return activeNetworkInfo != null && activeNetworkInfo.isConnected
        }
    }
}
