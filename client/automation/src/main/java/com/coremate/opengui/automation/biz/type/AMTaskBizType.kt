package com.coremate.opengui.automation.biz.type

import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.biz.tasks.common.check.AMCommonAutoReplyTask
import com.coremate.opengui.automation.biz.tasks.tk.mixvideo.AMTkPublishVideoMixTask
import com.coremate.opengui.automation.biz.tasks.tk.video.AMTkPublishVideoTask
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.AMWxLikeCommentTask
import kotlin.reflect.KClass

/**
 * Task type
 * */
enum class AMTaskBizType(
    val type: String,
    val targetApp: List<AMTargetApp>,
    val taskCls: KClass<*>
) {

    /** common */
    //Auto-reply(wx. tk. red)
    COMMON_AUTO_REPLY(
        "common_auto_reply",
        mutableListOf(
            AMTargetApp.WX,
            AMTargetApp.TK,
            AMTargetApp.RED,
            AMTargetApp.SYS_PERMISSION,
            AMTargetApp.OPLUS_PERMISSION
        ),
        AMCommonAutoReplyTask::class
    ),

    /** wx */
    //We Chat comment and like
    WX_LIKE_COMMENT(
        "wx_like_comment",
        mutableListOf(AMTargetApp.WX, AMTargetApp.SYS_PERMISSION, AMTargetApp.OPLUS_PERMISSION),
        AMWxLikeCommentTask::class
    ),

    /** tk */
    //Douyin video publishing (composition)
    TK_PUBLISH_VIDEO_MIX(
        "tk_publish_video_mix",
        mutableListOf(
            AMTargetApp.LV,
            AMTargetApp.TK,
            AMTargetApp.SYS_PERMISSION,
            AMTargetApp.OPLUS_PERMISSION
        ),
        AMTkPublishVideoMixTask::class
    ),

    //Douyin video publishing (AI-assisted)
    TK_PUBLISH_VIDEO_AI(
        "tk_publish_video_ai",
        mutableListOf(
            AMTargetApp.LV,
            AMTargetApp.TK,
            AMTargetApp.SYS_PERMISSION,
            AMTargetApp.OPLUS_PERMISSION
        ),
        AMTkPublishVideoTask::class
    );

    companion object {
        fun getBizType(type: String): AMTaskBizType {
            entries.forEach {
                if (it.type == type) {
                    return it
                }
            }
            return TK_PUBLISH_VIDEO_MIX
        }
    }


}
