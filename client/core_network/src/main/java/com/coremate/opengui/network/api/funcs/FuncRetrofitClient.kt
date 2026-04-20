package com.coremate.opengui.network.api.funcs

import android.content.Context
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.network.api.ServerConstant
import com.coremate.opengui.network.interceptors.CacheInterceptor
import com.coremate.opengui.network.interceptors.HeaderInterceptor
import com.coremate.opengui.network.interceptors.HttpInterceptor
import com.coremate.opengui.network.interceptors.LoggingInterceptor
import com.tencent.mmkv.MMKV
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.File
import java.util.concurrent.TimeUnit

object FuncRetrofitClient {


    fun create(context: Context): FuncApiService {
        // Create a cache object
        val cacheSize = (10 * 1024 * 1024).toLong() // 10 MB
        val cache = Cache(File(context.cacheDir, "http-cache"), cacheSize)
        val token = MMKV.defaultMMKV().decodeString("token")
        val httpLoggingInterceptor = HttpLoggingInterceptor { msg ->
            // 这里使用 ApplicationContext + 你习惯的 executionId
            LogManager.saveLog(
                context = context,   // 或 context.applicationContext
                tag = "OkHttp",
                message = msg,
                executionId = TaskCenter.executionId ?: -1  // 或者 0
            )
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        // Build OkHttpClient with interceptors and cache
        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS) // 连接超时
            .writeTimeout(30, TimeUnit.SECONDS)   // 这个无所谓GET，但最好保持一致
            .readTimeout(30, TimeUnit.SECONDS)    // 读取超时
            .addInterceptor(httpLoggingInterceptor)
            .addInterceptor(LoggingInterceptor())
            .addInterceptor(HttpInterceptor())
            .addInterceptor(HeaderInterceptor(token))
            .addInterceptor(CacheInterceptor(context)) // Add cache interceptor
            .cache(cache) // Set cache
            .build()

        // Build Retrofit instance
        val retrofit = Retrofit.Builder()
            .baseUrl(ServerConstant.getURL())
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        return retrofit.create(FuncApiService::class.java)
    }
}