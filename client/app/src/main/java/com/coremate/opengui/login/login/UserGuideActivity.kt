package com.coremate.opengui.login.login

import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.R
import com.coremate.opengui.databinding.ActivityUserGuideBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.feature.promotor.ui.home.HomeActivity
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.tencent.mmkv.MMKV
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class UserGuideActivity :
    BaseBindingActivity<ActivityUserGuideBinding>(ActivityUserGuideBinding::inflate) {

    companion object {
        const val EXTRA_SELECTED_GOALS = "selected_goals"
        const val EXTRA_SKIPPED = "skipped"
    }

    private data class Goal(
        val id: String,
        val label: String,
        val iconResId: Int,
        val color: String,
        val bgColor: String
    )

    private data class LayoutPos(val x: Int, val y: Int, val rotate: Int)

    private val goals = listOf(
        Goal("self-media", "Creator Growth", R.drawable.ic_guide_megaphone, "#059669", "#ECFDF5"),
        Goal(
            "comment-convert",
            "Comment Lead Generation",
            R.drawable.ic_guide_message_circle,
            "#D97706",
            "#FFFBEB"
        ),
        Goal("reputation", "Reputation Management", R.drawable.ic_guide_star, "#7C3AED", "#F5F3FF"),
        Goal("online-flyer", "Online Flyer", R.drawable.ic_guide_file_text, "#2563EB", "#EFF6FF"),
        Goal("competitor", "Competitor Price Check", R.drawable.ic_guide_search, "#DB2777", "#FDF2F8"),
        Goal("network", "Network Activation", R.drawable.ic_guide_users, "#0891B2", "#ECFEFF"),
        Goal("precise-acquire", "Targeted Lead Generation", R.drawable.ic_guide_target, "#DC2626", "#FEF2F2")
    )

    private val layoutPositions = listOf(
        LayoutPos(10, 2, -4),
        LayoutPos(55, 0, 3),
        LayoutPos(5, 16, 2),
        LayoutPos(50, 14, -2),
        LayoutPos(60, 28, 4),
        LayoutPos(10, 32, -3),
        LayoutPos(40, 46, 2)
    )

    private val selectedIds = mutableSetOf<String>()
    private val pillViews = mutableListOf<View>()
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var apiService: ApiService? = null

    override fun initParam() {
        apiService = RetrofitClient.create(this)
    }

    override fun initEvent() {
        binding.btnContinue.setOnClickListener {
            if (selectedIds.isEmpty()) return@setOnClickListener
            // active:scale-[0.98]
            it.animate().scaleX(0.98f).scaleY(0.98f).setDuration(100).withEndAction {
                it.animate().scaleX(1f).scaleY(1f).setDuration(100)
                completeOnboardingAndNavigate()
            }.start()
        }
        binding.btnSkip.setOnClickListener {
            completeOnboardingAndNavigate()
        }
    }

    /**
     */
    private fun completeOnboardingAndNavigate() {

        MMKV.defaultMMKV().encode("finishOnboarding", true)
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.completeOnboarding()
            }.onFailure {
                it.printStackTrace()
            }
            launch(Dispatchers.Main) {
                val intent = Intent(this@UserGuideActivity, HomeActivity::class.java)
                startActivity(intent)
                finish()
            }
        }
    }

    override fun initView() {


        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            binding.btnSkip.foreground = null
        }


        binding.headerLayout.alpha = 0f
        binding.bottomSection.alpha = 0f
        binding.bottomSection.translationY = AMScreenUtils.dp2px(20f).toFloat()

        // animate-fadeIn 0.5s ease
        binding.headerLayout.animate()
            .alpha(1f)
            .setDuration(500)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()


        binding.pillsContainer.post {
            addPills()
            startPillsDropIn()
            // animate-fadeInUp 0.5s ease 0.4s delay
            binding.bottomSection.postDelayed({
                binding.bottomSection.animate()
                    .alpha(1f)
                    .translationY(0f)
                    .setDuration(500)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .start()
            }, 400)
        }

        Handler(Looper.getMainLooper()).postDelayed({
            binding.btnSkip.setBackgroundColor(Color.WHITE)
        }, 600)

        updateContinueButton()
    }

    private fun addPills() {
        val container = binding.pillsContainer
        val w = container.width
        val h = container.height
        val density = resources.displayMetrics.density

        goals.forEachIndexed { index, goal ->
            val pos = layoutPositions[index]
            val pill = createPillView(goal, index, pos.rotate)
            val params = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            )
            params.leftMargin = (w * pos.x / 100)
            params.topMargin = (h * pos.y / 100)
            pill.layoutParams = params
            pill.alpha = 0f
            pill.translationY = -80 * density
            pill.scaleX = 0.9f
            pill.scaleY = 0.9f
            pill.rotation = pos.rotate.toFloat()
            container.addView(pill)
            pillViews.add(pill)
        }
    }

    private fun createPillView(goal: Goal, index: Int, rotation: Int): View {
        val context = this
        val density = resources.displayMetrics.density
        val horizontal = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(
                (12 * density).toInt(),
                (10 * density).toInt(),
                (16 * density).toInt(),
                (10 * density).toInt()
            )
            setBackgroundResource(R.drawable.bg_pill_default)
            elevation = 2 * density
            clipToPadding = false
        }

        val iconSize = (28 * density).toInt()
        val iconCircle = ImageView(context).apply {
            layoutParams = LinearLayout.LayoutParams(iconSize, iconSize).apply {
                marginEnd = (10 * density).toInt()
            }
            setPadding(
                AMScreenUtils.dp2px(5f),
                AMScreenUtils.dp2px(5f),
                AMScreenUtils.dp2px(5f),
                AMScreenUtils.dp2px(5f)
            )
            setImageResource(goal.iconResId)
            setColorFilter(Color.WHITE)
            background = GradientDrawable().apply {
                setShape(GradientDrawable.OVAL)
                setColor(Color.parseColor("#BFBFBF"))
            }
        }

        val label = TextView(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            text = goal.label
            setTextColor(Color.parseColor("#666666"))
            textSize = 15f
            setTypeface(null, Typeface.BOLD)
        }

        horizontal.addView(iconCircle)
        horizontal.addView(label)

        horizontal.setOnClickListener {
            // active:scale-95
            it.animate().scaleX(0.95f).scaleY(0.95f).setDuration(100).withEndAction {
                it.animate().scaleX(1f).scaleY(1f).setDuration(100).start()
            }.start()
            toggleSelect(goal.id, goal, horizontal, iconCircle, label)
        }

        horizontal.tag = Triple(goal, iconCircle, label)
        return horizontal
    }

    private fun toggleSelect(
        id: String,
        goal: Goal,
        pill: View,
        iconCircle: ImageView,
        label: TextView
    ) {
        if (selectedIds.contains(id)) {
            selectedIds.remove(id)
        } else {
            selectedIds.add(id)
        }
        val selected = selectedIds.contains(id)
        updatePillAppearance(pill, iconCircle, label, goal, selected)
        updateContinueButton()
    }

    private fun updatePillAppearance(
        pill: View,
        iconCircle: ImageView,
        label: TextView,
        goal: Goal,
        selected: Boolean
    ) {
        val density = resources.displayMetrics.density
        pill.setBackgroundResource(if (selected) 0 else R.drawable.bg_pill_default)
        if (selected) {
            val bg = GradientDrawable().apply {
                setShape(GradientDrawable.RECTANGLE)
                cornerRadius = 999 * density
                setColor(Color.parseColor(goal.bgColor))
            }
            pill.background = bg
            pill.elevation = 4 * density
            iconCircle.background = GradientDrawable().apply {
                setShape(GradientDrawable.OVAL)
                setColor(Color.parseColor(goal.color))
            }
            label.setTextColor(Color.parseColor(goal.color))
        } else {
            pill.elevation = 2 * density
            iconCircle.background = GradientDrawable().apply {
                setShape(GradientDrawable.OVAL)
                setColor(Color.parseColor("#BFBFBF"))
            }
            label.setTextColor(Color.parseColor("#666666"))
        }
    }

    private fun updateContinueButton() {
        binding.btnContinue.isEnabled = selectedIds.isNotEmpty()
    }

    private fun startPillsDropIn() {
        val density = resources.displayMetrics.density
        val dropInInterpolator = PathInterpolator(0.22f, 1f, 0.36f, 1f)

        pillViews.forEachIndexed { index, pill ->
            val pos = layoutPositions[index]
            val goal = goals[index]
            val (_, iconCircle, label) = pill.tag as Triple<*, *, *>
            pill.postDelayed({
                val anim = ValueAnimator.ofFloat(0f, 1f).apply {
                    duration = 600
                    interpolator = dropInInterpolator
                    addUpdateListener { va ->
                        val t = va.animatedValue as Float
                        val (alpha, transY, scale) = dropInKeyframes(t, density)
                        pill.alpha = alpha
                        pill.translationY = transY
                        pill.scaleX = scale
                        pill.scaleY = scale
                    }
                }
                anim.start()
            }, (index * 80).toLong())
        }
    }

    private fun dropInKeyframes(t: Float, density: Float): Triple<Float, Float, Float> {
        val alpha = when {
            t <= 0.5f -> t / 0.5f
            else -> 1f
        }
        val (transY, scale) = when {
            t <= 0.5f -> -80 * density to 0.9f
            t <= 0.7f -> {
                val u = (t - 0.5f) / 0.2f
                (-80 * (1 - u) + 6 * u) * density to (0.9f + 0.12f * u)
            }

            t <= 0.85f -> {
                val u = (t - 0.7f) / 0.15f
                (6 * (1 - u) - 3 * u) * density to (1.02f - 0.03f * u)
            }

            else -> {
                val u = (t - 0.85f) / 0.15f
                (-3 * (1 - u)) * density to (0.99f + 0.01f * u)
            }
        }
        return Triple(alpha, transY, scale)
    }
}
