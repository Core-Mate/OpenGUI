package com.coremate.opengui.automation.biz.tasks.wx.likecomment.test

import android.os.Bundle
import android.widget.SeekBar
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.coremate.opengui.automation.AMServiceManager
import com.coremate.opengui.automation.R
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.automation.base.utils.AMToastUtils
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentEventType
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentParam
import com.coremate.opengui.automation.biz.type.AMTaskBizType
import com.coremate.opengui.automation.databinding.ActivityAmwxLikeCommentTestBinding
import com.coremate.opengui.common_jvm.enums.CommentLength

class AMWxLikeCommentTestActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAmwxLikeCommentTestBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize binding
        binding = ActivityAmwxLikeCommentTestBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Set system insets
        ViewCompat.setOnApplyWindowInsetsListener(binding.main) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(
                AMScreenUtils.dp2px(16f),
                systemBars.top,
                AMScreenUtils.dp2px(16f),
                systemBars.bottom
            )
            insets
        }

        binding.seekReachCount.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                // Avoid displaying 0; minimum is 1
                val count = if (progress < 1) 1 else progress
                binding.tvReachCurrent.text = "$count"
            }

            override fun onStartTrackingTouch(seekBar: SeekBar?) {}

            override fun onStopTrackingTouch(seekBar: SeekBar?) {}
        })

        // Example: read input content and handle click event
        binding.btnStart.setOnClickListener {

            val doLike = binding.switchLike.isChecked
            val doComment = binding.switchComment.isChecked
            if (!doLike && !doComment) {
                AMToastUtils.showToast("请选择点赞或者评论")
                return@setOnClickListener
            }
            val eventType =
                if (doLike && !doComment) AMWxLikeCommentEventType.LIKE else if (!doLike && doComment) AMWxLikeCommentEventType.COMMENT else AMWxLikeCommentEventType.LIKE_AND_COMMENT
            val wordNum =
                when (binding.rgCommentLength.checkedRadioButtonId) {
                    R.id.rb_short -> CommentLength.SHORT
                    R.id.rb_medium -> CommentLength.MEDIUM
                    R.id.rb_long -> CommentLength.LONG
                    else -> CommentLength.SHORT
                }
            val reachCount = binding.seekReachCount.progress

            val param = AMWxLikeCommentParam(eventType, wordNum, reachCount)
            AMServiceManager.instance.processTask(
                this,
                AMDataContainer(AMTaskBizType.WX_LIKE_COMMENT, param)
            )

        }

    }
}