package com.coremate.opengui.automation.biz.common.float

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.ViewGroup
import com.coremate.opengui.automation.R
import com.coremate.opengui.automation.base.component.AMBaseFloatWindow
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMTaskChangedListener
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.automation.databinding.CompEnterBinding

/**
 * Enter dialog (active dialog)
 * */
class EnterFloat(context: Context) : AMBaseFloatWindow<CompEnterBinding, EnterRepository>(context),
    AMTaskChangedListener {

    override fun setBinding() =
        CompEnterBinding.inflate(LayoutInflater.from(context), this, true)

    private val mainHandler = Handler(Looper.getMainLooper())

    private var isLoading = false
        set(value) {
            field = value
            mainHandler.post {
                if (value) {
                    binding.ivLoading.visibility = VISIBLE
                    binding.ivControl.visibility = INVISIBLE
                } else {
                    binding.ivLoading.visibility = INVISIBLE
                    binding.ivControl.visibility = VISIBLE
                }
                updateState(amContext.taskManager.isTaskResume)
            }
        }

    private var isStopLoading = false
        set(value) {
            field = value
            mainHandler.post {
                if (value) {
                    binding.stopLoading.visibility = VISIBLE
                    binding.ivStop.visibility = INVISIBLE
                } else {
                    binding.stopLoading.visibility = INVISIBLE
                    binding.ivStop.visibility = VISIBLE
                }
            }
        }


    override fun initUIAndData(dataContainer: AMDataContainer?) {
        super.initUIAndData(dataContainer)

        amContext.taskManager.listener = this

        //End
        binding.llStop.setOnClickListener {
            if (isLoading) return@setOnClickListener
            isStopLoading = true
            listener?.onStopComp()
        }

        //Pause/Start
        binding.llControl.setOnClickListener {
            if (isLoading) return@setOnClickListener
            isLoading = true
            if (amContext.taskManager.isTaskResume) {
                listener?.onPauseComp()
            } else {
                listener?.onStartComp()
            }
        }

        updateState(amContext.taskManager.isTaskResume)
    }

    private fun updateState(isTaskResume: Boolean) {

        if (isTaskResume) {
            binding.ivControl.setImageResource(R.mipmap.ic_am_pause)
            binding.tvControl.text = "进行中"
        } else {
            binding.ivControl.setImageResource(R.mipmap.ic_am_start)
            binding.tvControl.text = "继续"
        }

    }

    override fun onChanged() {
        isLoading = false
        isStopLoading = false
    }

    override fun openDragMove() = false

    override fun show() {
        super.show()

        amContext.windowManager.add(
            this,
            repository.wpX,
            repository.wpY,
            AMScreenUtils.dp2px(81f),
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP
        )
    }


}