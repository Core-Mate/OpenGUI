package com.coremate.opengui.feature.promotor.ui.mine.preference.fragments

import android.graphics.Color
import android.graphics.Rect
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.WindowCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.coremate.opengui.common.utils.dpToPx
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.FragmentExecutePreferenceListBinding
import com.coremate.opengui.feature.promotor.ui.mine.preference.adapter.ExecutePreferenceSubListAdapter
import com.coremate.opengui.feature.promotor.ui.mine.preference.pojo.ExecutePreferenceSubListItemData


class ExecutePreferenceListFragment(val title:String) : BottomSheetDialogFragment() {

    private var listAdapter: ExecutePreferenceSubListAdapter? = null
    private lateinit var binding: FragmentExecutePreferenceListBinding
    private val list = mutableListOf<ExecutePreferenceSubListItemData>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, R.style.BottomSheetDialog)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentExecutePreferenceListBinding.inflate(inflater, container, false)
        listAdapter = ExecutePreferenceSubListAdapter {
            dismiss()
        }
        binding.rvList.adapter = listAdapter
        binding.rvList.layoutManager = LinearLayoutManager(context)
        binding.rvList.addItemDecoration(object : RecyclerView.ItemDecoration() {
            override fun getItemOffsets(
                outRect: Rect,
                view: View,
                parent: RecyclerView,
                state: RecyclerView.State
            ) {
                super.getItemOffsets(outRect, view, parent, state)
                outRect.top = 8.dpToPx(requireContext())
            }
        })
        binding.rvList.apply {
            binding.rvList.overScrollMode = RecyclerView.OVER_SCROLL_NEVER
        }
        binding.tvCancel.setOnClickListener {
            dismiss()
        }
        binding.tvClear.setOnClickListener {
            dismiss()
        }
        binding.tvConfirm.setOnClickListener {
            dismiss()
        }
        binding.tvTitle.text = title
        binding.etSearch.hint = "Search${title}..."
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        initData()
        listAdapter?.setData(list)
    }

    fun initData() {
        val bean1 = ExecutePreferenceSubListItemData(1, "$title - Data1", "")
        val bean2 = ExecutePreferenceSubListItemData(2, "$title - Data2", "")
        val bean3 = ExecutePreferenceSubListItemData(3, "$title - Data3", "")
        val bean4 = ExecutePreferenceSubListItemData(4, "$title - Data4", "")
        val bean5 = ExecutePreferenceSubListItemData(5, "$title - Data5", "")
        val bean6 = ExecutePreferenceSubListItemData(6, "$title - Data6", "")
        val bean7 = ExecutePreferenceSubListItemData(7, "$title - Data7", "")
        val bean8 = ExecutePreferenceSubListItemData(8, "$title - Data8", "")
        val bean9 = ExecutePreferenceSubListItemData(9, "$title - Data9", "")
        val bean10 = ExecutePreferenceSubListItemData(10, "$title - Data10", "")
        val bean11 = ExecutePreferenceSubListItemData(11, "$title - Data11", "")
        val bean12 = ExecutePreferenceSubListItemData(12, "$title - Data12", "")
        val bean13 = ExecutePreferenceSubListItemData(13, "$title - Data13", "")
        list.add(bean1)
        list.add(bean2)
        list.add(bean3)
        list.add(bean4)
        list.add(bean5)
        list.add(bean6)
        list.add(bean7)
        list.add(bean8)
        list.add(bean9)
        list.add(bean10)
        list.add(bean11)
        list.add(bean12)
        list.add(bean13)
    }


    override fun onStart() {
        super.onStart()
        val bottomSheet =
            dialog?.findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)
        if (bottomSheet != null) {
            val params = bottomSheet.layoutParams as CoordinatorLayout.LayoutParams
            params.width = FrameLayout.LayoutParams.MATCH_PARENT
            params.height = FrameLayout.LayoutParams.MATCH_PARENT
            bottomSheet.layoutParams = params
            val behavior = BottomSheetBehavior.from(bottomSheet).apply {
                isFitToContents = false
                peekHeight = 730.dpToPx(requireContext())
            }
        }

        if (dialog != null) {
            val window = dialog!!.window
            if (window != null) {
                window.setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                            WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
                )

                // Make dialog window layout fullscreen so the dim covers status bar
                WindowCompat.setDecorFitsSystemWindows(window, false)
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
                window.setStatusBarColor(Color.TRANSPARENT)
                window.setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }

            if (dialog is BottomSheetDialog) {
                val dialog = dialog as BottomSheetDialog?
                val bottomSheet =
                    dialog!!.findViewById<View?>(com.google.android.material.R.id.design_bottom_sheet)
                if (bottomSheet != null) {
                    val behavior = BottomSheetBehavior.from<View?>(bottomSheet)
                    behavior.skipCollapsed = true
                    behavior.setState(BottomSheetBehavior.STATE_EXPANDED)

                    behavior.isDraggable = false
                }
            }
        }
    }
}


