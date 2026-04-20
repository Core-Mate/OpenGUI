package com.coremate.opengui.network.interceptors

import okhttp3.Interceptor
import okhttp3.Response

class HeaderInterceptor(val token:String?) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val builder = request.newBuilder()
        builder.addHeader("Authorization", "Bearer $token")
        return chain.proceed(builder.build())
    }

}