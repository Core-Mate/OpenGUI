package com.coremate.opengui.network.api.mine

import com.google.gson.annotations.SerializedName

data class MyBalanceRespItem (
    val remaining: Long,            //当前可用积分
    val totalPurchased: Long,       //累计充值积分
    val totalUsed: Long,            //累计消费积分
    val freeCredits: Long,          //赠送积分
    var isCheckin:Boolean?,         //是否签到
    @SerializedName("checkinCredit")
    var checkinCredit:Long?         //签到可获得的积分
)

data class MyCheckinRespItem (
    @SerializedName("isCheckin")
    var isCheckin:Boolean?,         //本次签到是否成功
    @SerializedName("getCredit")
    var getCredit:Long?,            //本次签到获得的积分（失败返回0）
    @SerializedName("remaining")
    var remaining:Long?,            //当前剩余积分
)
