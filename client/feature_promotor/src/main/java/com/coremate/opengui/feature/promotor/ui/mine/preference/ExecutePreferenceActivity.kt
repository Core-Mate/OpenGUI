package com.coremate.opengui.feature.promotor.ui.mine.preference

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.PopupWindow
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.ActivityExecutePreferenceBinding
import com.coremate.opengui.feature.promotor.ui.mine.preference.fragments.ExecutePreferenceListFragment
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.feature.promotor.ui.base.context
import com.coremate.opengui.feature.promotor.ui.mine.preference.pojo.ExecutePreferenceItemData
import com.coremate.opengui.feature.promotor.ui.mine.preference.adapter.ExecutePreferenceListAdapter
import com.coremate.opengui.feature.promotor.ui.mine.preference.fragments.ExecutePreferenceEditFragment

class ExecutePreferenceActivity :
    BaseBindingActivity<ActivityExecutePreferenceBinding>(ActivityExecutePreferenceBinding::inflate) {

    private val dataList = mutableListOf<ExecutePreferenceItemData>()
    var adapter: ExecutePreferenceListAdapter? = null

    override fun initView() {
        binding.titlebar.setTitle("Execution preferences").setLeftIconClickListener {
            finish()
        }.setRightIconClickListener {
            showMenuPopupWindow(binding.titlebar.getMoreBtn())
        }
        adapter = ExecutePreferenceListAdapter(object :
            ExecutePreferenceListAdapter.IconClickListener {
            override fun onClick(bean: ExecutePreferenceItemData) {
                handleIconClick(bean)
            }
        })
        binding.preferenceList.adapter = adapter
        binding.preferenceList.layoutManager = LinearLayoutManager(context)
//        binding.preferenceList.addItemDecoration(object : RecyclerView.ItemDecoration() {
//            override fun getItemOffsets(
//                outRect: Rect,
//                view: View,
//                parent: RecyclerView,
//                state: RecyclerView.State
//            ) {
//                super.getItemOffsets(outRect, view, parent, state)
//                outRect.top = 12.dpToPx(context)
//            }
//        })
        adapter?.setData(dataList)
        binding.preferenceList.apply {
            binding.preferenceList.overScrollMode = RecyclerView.OVER_SCROLL_NEVER
        }
    }

    override fun initEvent() {
    }

    private var menuPopupWindow: PopupWindow? = null

    private fun showMenuPopupWindow(
        anchorView: View
    ) {

        if (menuPopupWindow != null && menuPopupWindow!!.isShowing) {
            menuPopupWindow!!.dismiss()
            return
        }
        val inflater = LayoutInflater.from(context)
        val popupView = inflater.inflate(R.layout.popup_execute_preference_menu, null)

        menuPopupWindow = PopupWindow(
            popupView,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            true
        )

        menuPopupWindow?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        menuPopupWindow?.isOutsideTouchable = true
        menuPopupWindow?.isFocusable = true

        menuPopupWindow?.showAsDropDown(anchorView, AMScreenUtils.dp2px(-70f), 0, Gravity.CENTER)
    }

    override fun initParam() {
        val bean1 = ExecutePreferenceItemData(1, "Industry", "Medical Aesthetics Sales", true)
        val bean2 = ExecutePreferenceItemData(2, "Target Audience", "Target Audience", true)
        val bean3 = ExecutePreferenceItemData(3, "Target Region", "Target Region", true)
        val bean4 = ExecutePreferenceItemData(4, "Product/Service Summary", "Product/Service Summary", true)
        val bean5 = ExecutePreferenceItemData(5, "Tone", "Tone", false)
        val bean6 = ExecutePreferenceItemData(6, "Price", "Price", false)
        val bean7 = ExecutePreferenceItemData(7, "Product Strengths", "Product Strengths", false)
        val bean8 = ExecutePreferenceItemData(8, "Engagement Level", "Engagement Level", false)
        val bean9 = ExecutePreferenceItemData(9, "Product/Service Summary", "Product/Service Summary", false)
        this.dataList.add(bean1)
        this.dataList.add(bean2)
        this.dataList.add(bean3)
        this.dataList.add(bean4)
        this.dataList.add(bean5)
        this.dataList.add(bean6)
        this.dataList.add(bean7)
        this.dataList.add(bean8)
        this.dataList.add(bean9)
    }

    private fun handleIconClick(bean: ExecutePreferenceItemData) {
        when (bean.id) {
            1 -> {
                showPreferenceBottomSheet(bean.title)
            }

            2 -> {
                showPreferenceEditSheet(bean.title, bean.content!!)
            }

            3 -> {
                showPreferenceBottomSheet(bean.title)
            }

            4 -> {
                showPreferenceEditSheet(bean.title, bean.content!!)
            }

            5 -> {
                showPreferenceBottomSheet(bean.title)
            }

            6 -> {
                showPreferenceEditSheet(bean.title, bean.content!!)
            }

            7 -> {
                showPreferenceBottomSheet(bean.title)
            }

            8 -> {
                showPreferenceEditSheet(bean.title, bean.content!!)
            }

            9 -> {
                showPreferenceBottomSheet(bean.title)
            }
        }
    }

    private fun showPreferenceBottomSheet(title: String) {
        val bottomSheetDialog = ExecutePreferenceListFragment(title)
        bottomSheetDialog.show(supportFragmentManager, ExecutePreferenceListFragment::class.java.simpleName)
    }

    private fun showPreferenceEditSheet(title: String, content: String) {
        val bottomSheetDialog = ExecutePreferenceEditFragment(title, content)
        bottomSheetDialog.show(supportFragmentManager, ExecutePreferenceEditFragment::class.java.simpleName)
    }
}