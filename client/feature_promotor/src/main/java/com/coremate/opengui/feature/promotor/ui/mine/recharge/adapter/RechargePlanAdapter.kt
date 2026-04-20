package com.coremate.opengui.feature.promotor.ui.mine.recharge.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.ui.mine.recharge.SubscriptionPlan

class RechargePlanAdapter(
    private var plans: List<SubscriptionPlan> = emptyList(),
    private var selectedPlanId: String? = null,
    private val onPlanClick: (SubscriptionPlan) -> Unit
) : RecyclerView.Adapter<RechargePlanAdapter.PlanViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PlanViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_recharge_plan, parent, false)
        return PlanViewHolder(view)
    }

    override fun onBindViewHolder(holder: PlanViewHolder, position: Int) {
        holder.bind(plans[position], plans[position].id == selectedPlanId, onPlanClick)
    }

    override fun getItemCount(): Int = plans.size

    fun setData(newPlans: List<SubscriptionPlan>) {
        plans = newPlans
        if (selectedPlanId == null && newPlans.isNotEmpty()) {
            selectedPlanId = newPlans.firstOrNull { it.isRecommended }?.id ?: newPlans.first().id
        }
        notifyDataSetChanged()
    }

    fun setSelectedPlan(plan: SubscriptionPlan?) {
        val oldId = selectedPlanId
        selectedPlanId = plan?.id
        val oldIndex = plans.indexOfFirst { it.id == oldId }
        val newIndex = plans.indexOfFirst { it.id == selectedPlanId }
        if (oldIndex in plans.indices) notifyItemChanged(oldIndex)
        if (newIndex in plans.indices) notifyItemChanged(newIndex)
    }

    fun getSelectedPlan(): SubscriptionPlan? =
        plans.firstOrNull { it.id == selectedPlanId }

    class PlanViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val cardRoot: View = itemView.findViewById(R.id.card_plan_root)
        private val tagRecommend: View = itemView.findViewById(R.id.tag_recommend)
        private val tagDiscount: TextView = itemView.findViewById(R.id.tag_discount)
        private val tvPlanName: TextView = itemView.findViewById(R.id.tv_plan_name)
        private val tvPlanPrice: TextView = itemView.findViewById(R.id.tv_plan_price)
        private val tvPlanCredits: TextView = itemView.findViewById(R.id.tv_plan_credits)
        private val tvPlanDesc: TextView = itemView.findViewById(R.id.tv_plan_desc)
        private val iconCheck: ImageView = itemView.findViewById(R.id.icon_plan_check)

        fun bind(plan: SubscriptionPlan, isSelected: Boolean, onPlanClick: (SubscriptionPlan) -> Unit) {
            tagRecommend.visibility = if (plan.isRecommended) View.VISIBLE else View.GONE
            if (plan.discount > 0) {
                tagDiscount.visibility = View.VISIBLE
                tagDiscount.text = "省${plan.discount}%"
            } else {
                tagDiscount.visibility = View.GONE
            }

            tvPlanName.text = plan.name
            tvPlanPrice.text = "¥${plan.price}"
            tvPlanCredits.text = "${plan.credits.toLong().toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ",")}积分"
            tvPlanDesc.text = plan.description
            tvPlanDesc.visibility = if (plan.description.isNotEmpty()) View.VISIBLE else View.GONE

            cardRoot.setBackgroundResource(
                if (isSelected) R.drawable.bg_plan_card_selected else R.drawable.bg_plan_card_unselected
            )
            iconCheck.visibility = if (isSelected) View.VISIBLE else View.GONE
            tvPlanName.setTextColor(if (isSelected) 0xFF2E58FF.toInt() else 0xFF0B1120.toInt())
            tvPlanPrice.setTextColor(if (isSelected) 0xFF2E58FF.toInt() else 0xFF0B1120.toInt())

            cardRoot.setOnClickListener { onPlanClick(plan) }
        }
    }
}
