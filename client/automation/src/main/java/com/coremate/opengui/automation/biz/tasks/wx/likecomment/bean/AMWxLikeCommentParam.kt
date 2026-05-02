package com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean

import com.coremate.opengui.common_jvm.enums.CommentLength


enum class AMWxLikeCommentEventType {
    LIKE, // Like.
    COMMENT, // Comment.
    LIKE_AND_COMMENT // Like and comment.
}

data class AMWxLikeCommentParam(
    //Event type
    var eventType: AMWxLikeCommentEventType = AMWxLikeCommentEventType.LIKE,
    // Comment text selection, used when eventType is COMMENT or LIKE_AND_COMMENT.
    var wordNum: CommentLength = CommentLength.SHORT,
    //Reach count
    var count: Int = 1
)
