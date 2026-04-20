package com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean

import com.coremate.opengui.common_jvm.enums.CommentLength


enum class AMWxLikeCommentEventType {
    LIKE, //点赞
    COMMENT, //评论
    LIKE_AND_COMMENT //点赞和评论
}

data class AMWxLikeCommentParam(
    //事件类型
    var eventType: AMWxLikeCommentEventType = AMWxLikeCommentEventType.LIKE,
    //评论文字选择 (eventType = COMMENT 或者 LIKE_AND_COMMENT，使用)
    var wordNum: CommentLength = CommentLength.SHORT,
    //触达次数
    var count: Int = 1
)