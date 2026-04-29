package com.coremate.opengui.network.api.funcs

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface FuncApiService {


    @GET("missions")
    suspend fun getMissions(): Response<List<FuncItemBean>>


    @POST("missions")
    suspend fun createMission(@Body requestBody: FuncCreateRequest): Response<FuncItemBean>

    //DeleteCustom task
    @DELETE("missions/{id}")
    suspend fun delMission(@Path("id") id: Long): Response<FuncItemBean>
}