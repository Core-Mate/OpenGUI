package com.coremate.opengui.feature.promotor.ui.mine.recharge

import android.graphics.Color
import android.os.Bundle
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.widget.TextView
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.WindowCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.FragmentRechargeBinding
import com.coremate.opengui.feature.promotor.ui.mine.recharge.adapter.RechargePlanAdapter

/**
 */
class RechargeFragment : BottomSheetDialogFragment() {

    private lateinit var binding: FragmentRechargeBinding
    private var currentPoints: Int = 0
    private var isProcessing = false

    private var planAdapter: RechargePlanAdapter? = null

    var listener: RechargeFragmentListener? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setStyle(STYLE_NORMAL, R.style.BottomSheetDialog)
        currentPoints = arguments?.getInt(ARG_CURRENT_POINTS, 0) ?: 0
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentRechargeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.imgClose.setOnClickListener {
            if (!isProcessing) dismiss()
        }

        binding.tvCurrentPoints.text = "${currentPoints}Credits"

        planAdapter = RechargePlanAdapter(
            plans = emptyList(),
            selectedPlanId = null,
            onPlanClick = { plan ->
                planAdapter?.setSelectedPlan(plan)
                updateSubscribeButtonText()
            }
        )
        binding.rvRechargePlans.layoutManager = LinearLayoutManager(requireContext())
        binding.rvRechargePlans.adapter = planAdapter
        binding.rvRechargePlans.isNestedScrollingEnabled = false

        setPlans(DEFAULT_PLANS)

        binding.btnSubscribe.setOnClickListener {
            if (isProcessing) return@setOnClickListener
            val selected = planAdapter?.getSelectedPlan() ?: return@setOnClickListener
            isProcessing = true
            binding.btnSubscribe.text = "Processing..."
            binding.btnSubscribe.isEnabled = false
            binding.btnSubscribe.postDelayed({
                isProcessing = false
                binding.btnSubscribe.isEnabled = true
                updateSubscribeButtonText()
                listener?.onPay(selected, selected.credits)
                dismiss()
            }, 1500)
        }

        applyPointsHintBlack()
        applyAgreementLinkColor()
    }

    private fun applyPointsHintBlack() {
        val root = binding.root as? android.view.ViewGroup ?: return
        if (root.childCount <= 3) return
        val pointsLayout = root.getChildAt(3) as? android.view.ViewGroup ?: return
        if (pointsLayout.childCount <= 1) return
        val tv = pointsLayout.getChildAt(1) as? TextView ?: return
        val full = "Uses about 2 credits per minute. Actual usage depends on task complexity. Credits cover AI compute and cloud resources and are valid for the current month."
        val prefix = "Uses about 2 credits per minute"
        val ssb = SpannableStringBuilder(full)
        ssb.setSpan(
            ForegroundColorSpan(Color.BLACK),
            0,
            prefix.length,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        tv.text = ssb
    }

    private fun applyAgreementLinkColor() {

        val tv = binding.tvProtocol
        val full = "By subscribing, you agree to the User Agreement and Privacy Policy."
        val blue = 0xFF2E58FF.toInt()
        val s1 = "User Agreement"
        val s2 = "Privacy Policy"
        val ssb = SpannableStringBuilder(full)
        val i1 = full.indexOf(s1)
        val i2 = full.indexOf(s2)
        if (i1 >= 0) ssb.setSpan(ForegroundColorSpan(blue), i1, i1 + s1.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (i2 >= 0) ssb.setSpan(ForegroundColorSpan(blue), i2, i2 + s2.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        tv.text = ssb
    }

    private fun updateSubscribeButtonText() {
        val selected = planAdapter?.getSelectedPlan()
        binding.btnSubscribe.text = if (selected != null) "¥${selected.price}/month Subscribe Now" else "Subscribe Now"
    }

    /**
     */
    fun setPlans(plans: List<SubscriptionPlan>) {
        planAdapter?.setData(plans)
        updateSubscribeButtonText()
    }

    override fun onStart() {
        super.onStart()
        val bottomSheet =
            dialog?.findViewById<FrameLayout>(com.google.android.material.R.id.design_bottom_sheet)
        if (bottomSheet != null) {
            val params = bottomSheet.layoutParams as CoordinatorLayout.LayoutParams
            params.width = FrameLayout.LayoutParams.MATCH_PARENT
            params.height = FrameLayout.LayoutParams.WRAP_CONTENT
            bottomSheet.layoutParams = params
        }

        if (dialog != null) {
            val window = dialog!!.window
            if (window != null) {
                window.setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                            WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN
                )
                WindowCompat.setDecorFitsSystemWindows(window, false)
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
                window.setStatusBarColor(Color.TRANSPARENT)
            }

            if (dialog is BottomSheetDialog) {
                val sheet = (dialog as BottomSheetDialog)
                    .findViewById<View?>(com.google.android.material.R.id.design_bottom_sheet)
                if (sheet != null) {
                    val behavior = BottomSheetBehavior.from<View?>(sheet)
                    behavior.skipCollapsed = true
                    behavior.state = BottomSheetBehavior.STATE_EXPANDED
                    behavior.isDraggable = false
                }
            }
        }
    }

    interface RechargeFragmentListener {
        fun onPay(plan: SubscriptionPlan, creditsAdded: Int)
    }

    companion object {
        private const val ARG_CURRENT_POINTS = "arg_current_points"

        fun newInstance(currentPoints: Int = 0): RechargeFragment {
            return RechargeFragment().apply {
                arguments = Bundle().apply {
                    putInt(ARG_CURRENT_POINTS, currentPoints)
                }
            }
        }

        private val DEFAULT_PLANS = listOf(
            SubscriptionPlan("plan_trial", "Trial", 29, 600, 0, false, "Good for new users"),
            SubscriptionPlan("plan_standard", "Standard", 199, 4500, 8, true, "Recommended for daily use"),
            SubscriptionPlan("plan_premium", "Premium", 599, 15000, 17, false, "Best for heavy users")
        )
    }
}

data class SubscriptionPlan(
    val id: String,
    val name: String,
    val price: Int,
    val credits: Int,
    val discount: Int,
    val isRecommended: Boolean,
    val description: String
)
