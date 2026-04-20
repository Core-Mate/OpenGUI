package com.coremate.opengui.network.api

import com.coremate.opengui.common.config.AppConfigResp
import com.coremate.opengui.network.api.ai_role.DefaultModel
import com.coremate.opengui.network.api.ai_role.GetAIRoleBean
import com.coremate.opengui.network.api.ai_role.PostAIRoleBean
import com.coremate.opengui.common.config.SupportApp
import com.coremate.opengui.network.api.heartbeat.HeartBeatResp
import com.coremate.opengui.network.api.history.ConversationMessageResp
import com.coremate.opengui.network.api.history.ConversationsResp
import com.coremate.opengui.network.api.login.LoginRequestBean
import com.coremate.opengui.network.api.login.OnboardingStatusResp
import com.coremate.opengui.network.api.login.RequestVerificationCode
import com.coremate.opengui.network.api.login.VerificationCodeResp
import com.coremate.opengui.network.api.login.VerifyCodeRequestBean
import com.coremate.opengui.network.api.login.VerifyCodeResp
import com.coremate.opengui.network.api.mine.MyBalanceRespItem
import com.coremate.opengui.network.api.mine.MyCheckinRespItem
import com.coremate.opengui.network.api.mission.ChatMessageRequest
import com.coremate.opengui.network.api.mission.ChatMessageResp
import com.coremate.opengui.network.api.mission.MissionBean
import com.coremate.opengui.network.api.mission_schedules.AddMissionSchedulesRequestBean
import com.coremate.opengui.network.api.mission_schedules.MissionSchedulesBean
import com.coremate.opengui.network.api.task.CreateTaskReq
import com.coremate.opengui.network.api.task.CreateTaskResp
import com.coremate.opengui.network.api.task.DeleteTaskResp
import com.coremate.opengui.network.api.task.ExecuteTaskReq
import com.coremate.opengui.network.api.task.ExecuteTaskResp
import com.coremate.opengui.network.api.task.PauseTaskResp
import com.coremate.opengui.network.api.task.ResumeTaskReq
import com.coremate.opengui.network.api.task.TaskExecutionsResult
import com.coremate.opengui.network.api.task.TaskHistoryResp
import com.coremate.opengui.network.api.task.TaskListResp
import com.coremate.opengui.network.api.task.TaskTemplatesResp
import com.coremate.opengui.network.api.task.UpdateTaskReq
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {
    @GET("chat/history")
    suspend fun getChatHistory(
        @Query("device_id") deviceId: String,
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int
    ): Response<ChatHistoryResponse> // 使用我们定义的数据模型作为返回类型

    @GET("chat/agent-messages")
    suspend fun getAgentMessages(
        @Query("chat_message_id") chatMessageId: Int,
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int
    ): Response<AgentMessageResponse>

    // 暂停任务接口
    @POST("task/{taskId}/pause")
    suspend fun pauseTask(@Path("taskId") taskId: Long): Response<TaskControlResponse>

    // 恢复任务接口
    @POST("task/{taskId}/resume")
    suspend fun resumeTask(@Path("taskId") taskId: Long): Response<TaskControlResponse>

    // 停止任务接口
    @POST("task/{taskId}/stop")
    suspend fun stopTask(@Path("taskId") taskId: Long): Response<TaskControlResponse>

    @POST("new-agent/abort/{taskId}")
    suspend fun abortTask(@Path("taskId") taskId: Long): Response<TaskControlResponse>


    @POST("new-agent/abort-all")
    suspend fun abortAllTask(@Body requestBody: AbortAllTaskRequest): Response<TaskControlResponse>

    // 停止设备上所有任务接口
    @POST("task/device/{deviceId}/stop-all")
    suspend fun stopAllDeviceTasks(@Path("deviceId") deviceId: String): Response<StopAllTasksResponse>

    suspend fun getChatMessages(
        @Query("device_id") deviceId: String,
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int
    ): Response<ChatHistoryResponse>


    @POST("user/login")
    suspend fun login(@Body body: LoginRequestBean): Response<Any>

    @POST("mission-schedules")
    suspend fun addMissionSchedules(@Body body: AddMissionSchedulesRequestBean): Response<MissionSchedulesBean>

    @GET("mission-schedules")
    suspend fun getMissionSchedules(): Response<MutableList<MissionSchedulesBean>>

    @GET("missions")
    suspend fun getMissions(): Response<MutableList<MissionBean>>

    @GET("setting/ai-role/current-user")
    suspend fun getAiRole(): Response<GetAIRoleBean>

    @POST("setting/ai-role/current-user")
    suspend fun saveAiRole(@Body body: PostAIRoleBean): Response<GetAIRoleBean>

    @PUT("setting/ai-role/current-user")
    suspend fun updateAiRole(@Body body: PostAIRoleBean): Response<GetAIRoleBean>

    @DELETE("setting/ai-role/current-user")
    suspend fun deleteAiRole()


    @POST("api/chat/send")
    suspend fun sendPrompt(@Body body: ChatMessageRequest): Response<ChatMessageResp>

    @PUT("/api/executions/cancel-all")
    suspend fun cancelAllTask(): Response<Any>

    @PUT("/api/executions/{executionId}/cancel")
    suspend fun cancelExecution(@Path("executionId") executionId: Int?): Response<Any>

    @GET("api/chat/conversations")
    suspend fun getConversations(): Response<MutableList<ConversationsResp>>

    @GET("/api/chat/conversations/{conversationId}/messages")
    suspend fun getConversationMessages(
        @Path("conversationId") conversationId: Int,
        @Query("limit") limit: Int,
        @Query("offset") offset: Int
    ): Response<ConversationMessageResp>

    @GET("/user/config/default-model")
    suspend fun getDefaultModel(): Response<DefaultModel>

    @POST("/user/config/default-model")
    suspend fun setDefaultModel(@Body body: DefaultModel)

    @Multipart
    @POST("/tos/upload-log")
    suspend fun uploadLog(@Part file: MultipartBody.Part): Response<Any>


    @GET("/api/tasks/templates")
    suspend fun getTaskTemplatesResp(): Response<List<TaskTemplatesResp>>

    @POST("/api/tasks")
    suspend fun addCustomTask(@Body body: CreateTaskReq): Response<CreateTaskResp>

    @GET("/api/tasks")
    suspend fun getMyTask(
        @Query("page") page: Int,
        @Query("pageSize") pageSize: Int,
        @Query("category") category: String?,
        @Query("platform") platform: String?,
        @Query("keyword") keyword: String?
    ): Response<TaskListResp>

    @POST("/api/tasks/{taskId}/execute")
    suspend fun executeTask(
        @Path("taskId") taskId: Int,
        @Body body: ExecuteTaskReq
    ): Response<ExecuteTaskResp>

    @PUT("/api/executions/{taskId}/pause")
    suspend fun newPauseTask(@Path("taskId") taskId: Int?): Response<PauseTaskResp>

    @PUT("/api/executions/{taskId}/resume")
    suspend fun newResumeTask(@Path("taskId") taskId: Int?): Response<PauseTaskResp>

    @PUT("/api/executions/{taskId}/resume")
    suspend fun newResumeTask(
        @Body body: ResumeTaskReq?,
        @Path("taskId") taskId: Int?
    ): Response<PauseTaskResp>

    @GET("/api/executions/{taskId}")
    suspend fun getTaskExecutionsResult(@Path("taskId") taskId: Int?): Response<TaskExecutionsResult>

    @POST("/api/tasks")
    suspend fun saveCustomTask(@Body body: CreateTaskReq?): Response<CreateTaskResp>

    @PUT("/api/tasks/{taskId}")
    suspend fun saveCustomTask(
        @Path("taskId") taskId: Int?,
        @Body body: CreateTaskReq?
    ): Response<CreateTaskResp>

    @PUT("/api/tasks/{taskId}")
    suspend fun updateTask(
        @Path("taskId") taskId: Int?,
        @Body body: UpdateTaskReq?
    ): Response<TaskTemplatesResp>


    @GET("/api/tasks/{taskId}/executions")
    suspend fun getTaskExecuteHistory(
        @Path("taskId") taskId: Int?
    ): Response<TaskHistoryResp>

    @DELETE("/api/tasks/{taskId}")
    suspend fun deleteTask(
        @Path("taskId") taskId: Int?
    ): Response<DeleteTaskResp>


    //    -------------------------
    //    请求验证码
    @POST("/api/user-auth/send-otp")
    suspend fun requestVerificationCode(
        @Body body: RequestVerificationCode
    ): Response<VerificationCodeResp>

    //    验证码登录（自动注册）
    @POST("/api/user-auth/verify-otp")
    suspend fun verifyCode(
        @Body body: VerifyCodeRequestBean
    ): Response<VerifyCodeResp>

    //    获取 onboarding 状态
    @GET("/api/user-auth/onboarding-status")
    suspend fun getOnboardingStatus(): Response<OnboardingStatusResp>

    //    完成 onboarding
    @PUT("/api/users/profile/onboarding-complete")
    suspend fun completeOnboarding(): Response<Any>

    //积分余额
    @GET("/api/user/balance")
    suspend fun getUserBalance(
    ): Response<MyBalanceRespItem>

    @POST("/api/user/checkin")
    suspend fun userCheckin(
    ): Response<MyCheckinRespItem>

    @POST("/api/executions/{executionId}/heartbeat")
    suspend fun heartBeat(@Path("executionId") executionId: Int?): Response<HeartBeatResp>

    @GET("/api/app-config")
    suspend fun loadAppConfig(): Response<AppConfigResp>

}