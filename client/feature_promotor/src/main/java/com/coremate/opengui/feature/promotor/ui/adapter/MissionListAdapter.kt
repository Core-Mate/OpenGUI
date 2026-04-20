package com.coremate.opengui.feature.promotor.ui.adapter

import android.content.Context
import android.graphics.Color
import android.os.Build
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.ImageView
import android.widget.TextView
import androidx.annotation.RequiresApi
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.network.api.mission.UIMissionBean

@RequiresApi(Build.VERSION_CODES.O)
class MissionListAdapter(
    context: Context,
    private val dataList: List<UIMissionBean>
) :
    BaseAdapter() {

    private val inflater: LayoutInflater = LayoutInflater.from(context)

    override fun getCount(): Int = dataList.size

    override fun getItem(position: Int): Any = dataList[position]

    override fun getItemId(position: Int): Long = position.toLong()


    override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
        val item = dataList[position]
        val view = convertView
            ?: inflater.inflate(
                R.layout.mission_list_item,
                parent,
                false
            )
        val missionName = view.findViewById<TextView>(R.id.tv_mission_name)
        val checked = view.findViewById<ImageView>(R.id.img_check)
        missionName.text = item.missionBean.customName
        if (item.checked) {
            checked.visibility = View.VISIBLE
            missionName.setTextColor(Color.parseColor("#5755FF"))
        } else {
            checked.visibility = View.GONE
            missionName.setTextColor(Color.parseColor("#000000"))
        }
        return view
    }
}