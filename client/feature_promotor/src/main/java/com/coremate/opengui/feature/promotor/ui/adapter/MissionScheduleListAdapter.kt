package com.coremate.opengui.feature.promotor.ui.adapter

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.RequiresApi
import androidx.cardview.widget.CardView
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.network.api.bean.UITaskBean
import com.coremate.opengui.network.api.mission_schedules.MissionSchedulesBean
import com.coremate.opengui.network.api.mission_schedules.UIMissionSchedulesBean
import org.json.JSONObject

@RequiresApi(Build.VERSION_CODES.O)
class MissionScheduleListAdapter(
    private val context: Context,
    private val dataList: List<UIMissionSchedulesBean>
) :
    BaseAdapter() {

    private val inflater: LayoutInflater = LayoutInflater.from(context)

    override fun getCount(): Int = dataList.size

    override fun getItem(position: Int): Any = dataList[position]

    override fun getItemId(position: Int): Long = position.toLong()

    override fun getViewTypeCount(): Int = 2

    override fun getItemViewType(position: Int): Int {
        return if (position % 2 == 0) {
            MissionSchedulesBean.TYPE_HAS_TIME
        } else {
            MissionSchedulesBean.TYPE_NO_TIME
        }
    }


    override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
        val itemType = getItemViewType(position)
        val view: View
        val item = dataList[position]

        if (convertView == null) {

            view = when (itemType) {
                MissionSchedulesBean.TYPE_HAS_TIME -> inflater.inflate(
                    R.layout.mission_schedule_list_item_has_time,
                    parent,
                    false
                )

                MissionSchedulesBean.TYPE_NO_TIME -> inflater.inflate(
                    R.layout.mission_schedule_list_item_no_time,
                    parent,
                    false
                )

                else -> throw IllegalArgumentException("Invalid item type")
            }
        } else {
            view = convertView
        }

        if (position % 2 == 0) {
            val tvTimeTag = view.findViewById<TextView>(R.id.tv_time_tag)
            tvTimeTag.text = item.timeTag
        }


        when (itemType) {
            UITaskBean.TYPE_HAS_TIME -> {
                val tvTimeTag = view.findViewById<TextView>(R.id.tv_time_tag)
                val taskWrap = view.findViewById<CardView>(R.id.task_wrap)
                val taskContentWrap = view.findViewById<LinearLayout>(R.id.task_content_wrap)
                val imgTaskIcon = view.findViewById<ImageView>(R.id.img_task_icon)
                val tvTaskName = view.findViewById<TextView>(R.id.tv_task_name)
                val tvExecuting = view.findViewById<TextView>(R.id.tv_executing)
                if (item.missionSchedulesBean == null) {
                    taskWrap.visibility = View.INVISIBLE
                    tvExecuting.visibility = View.INVISIBLE
                } else {
                    taskWrap.visibility = View.VISIBLE
                    tvTaskName.text = item.missionName
                    tvExecuting.visibility = View.INVISIBLE
                    if(item.missionSchedulesBean!!.cardStyle == null){
                        taskContentWrap.setBackgroundColor(Color.parseColor("#FC724F"))
                    }else{
                        val json = JSONObject(item.missionSchedulesBean!!.cardStyle!!)
                        val startColor = json.optInt("startColor")
                        val endColor = json.optInt("endColor")
                        val gradientDrawable = GradientDrawable(
                            GradientDrawable.Orientation.BR_TL,
                            intArrayOf(Color.parseColor(toHexString(startColor)), Color.parseColor(toHexString(endColor)))
                        )
                        taskContentWrap.background = gradientDrawable
                    }
                }
            }

            UITaskBean.TYPE_NO_TIME -> {
                val taskWrap = view.findViewById<CardView>(R.id.task_wrap)
                val imgTaskIcon = view.findViewById<ImageView>(R.id.img_task_icon)
                val taskContentWrap = view.findViewById<LinearLayout>(R.id.task_content_wrap)
                val tvTaskName = view.findViewById<TextView>(R.id.tv_task_name)
                val tvExecuting = view.findViewById<TextView>(R.id.tv_executing)
                if (item.missionSchedulesBean == null) {
                    taskWrap.visibility = View.INVISIBLE
                    tvExecuting.visibility = View.INVISIBLE
                } else {
                    taskWrap.visibility = View.VISIBLE
                    tvExecuting.visibility = View.INVISIBLE
                    tvTaskName.text = item.missionName
                    if(item.missionSchedulesBean!!.cardStyle == null){
                        taskContentWrap.setBackgroundColor(Color.parseColor("#FC724F"))
                    }else{
                        val json = JSONObject(item.missionSchedulesBean!!.cardStyle!!)
                        Log.d("TAG", "getView: --------->${json.toString()}")
                        val startColor = json.optInt("startColor")
                        val endColor = json.optInt("endColor")
                        val gradientDrawable = GradientDrawable(
                            GradientDrawable.Orientation.BR_TL,
                            intArrayOf(Color.parseColor(toHexString(startColor)), Color.parseColor(toHexString(endColor)))
                        )
                        taskContentWrap.background = gradientDrawable
                    }
                }
            }
        }
        return view
    }

    fun toHexString(colorInt: Int): String {
        return String.format("#%08X", colorInt)
    }

    fun convertColorStringsToIntArray(colorStrings: Array<String>): IntArray {
        return colorStrings.map { colorString ->
            Color.parseColor(colorString)
        }.toIntArray()
    }
}