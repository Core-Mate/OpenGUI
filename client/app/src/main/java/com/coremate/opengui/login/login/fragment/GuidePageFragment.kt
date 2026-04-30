package com.coremate.opengui.login.login.fragment

import android.animation.Animator
import android.animation.AnimatorSet
import android.animation.ValueAnimator
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.LinearLayout
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.databinding.FragmentGuidePageBinding
import com.coremate.opengui.feature.promotor.R

data class OnboardingItem(
    val imageResId: Int,
    val title: String,
    val description: String
)

class GuidePageFragment : Fragment() {
    private var _binding: FragmentGuidePageBinding? = null
    private val binding get() = _binding!!

    /// data
    private var currentPage = 0
    private var previousPage = 0
    private val indicatorViews = mutableListOf<View>()
    private val onboardingPages = listOf(
        OnboardingItem(
            R.drawable.onboarding_3,
            "Open apps automatically",
            "OpenGUI can wake apps automatically for seamless cross-app workflows."
        ),
        OnboardingItem(
            R.drawable.onboarding_1,
            "Rich Preset Tasks",
            "Built-in standardized task templates for multiple scenarios, with quick launch and flexible configuration."
        ),
        OnboardingItem(
            R.drawable.onboarding_2,
            "Protect Data and Privacy",
            "Uses encryption and permission isolation to protect your core data."
        )
    )

    /// listener
    private var onNextPageListener: (() -> Unit)? = null
    fun setOnNextPageListener(listener: () -> Unit) {
        onNextPageListener = listener
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentGuidePageBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupIndicators()
        updatePage(animate = false)

        binding.buttonNext.setOnClickListener {
            if (currentPage < onboardingPages.size - 1) {
                currentPage++
                updatePage()
            } else {
                onComplete()
            }
        }
    }

    private fun setupIndicators() {
        val container = binding.indicatorsContainer
        container.removeAllViews()
        indicatorViews.clear()

        onboardingPages.forEachIndexed { index, _ ->
            val indicator = View(context).apply {
                layoutParams = LinearLayout.LayoutParams(
                    if (index == currentPage) AMScreenUtils.dp2px(24f) else AMScreenUtils.dp2px(8f),
                    AMScreenUtils.dp2px(8f)
                ).apply {
                    rightMargin =
                        if (index < onboardingPages.size - 1) AMScreenUtils.dp2px(9f) else 0
                }
                background = ContextCompat.getDrawable(
                    context,
                    if (index == currentPage) R.drawable.indicator_active else R.drawable.indicator_inactive
                )
            }
            indicatorViews.add(indicator)
            container.addView(indicator)
        }
    }

    private fun animateIndicators() {
        if (indicatorViews.isEmpty()) return

        val activeWidth = AMScreenUtils.dp2px(24f)
        val inactiveWidth = AMScreenUtils.dp2px(8f)
        val animDuration = 250L

        val animatorSet = AnimatorSet()
        val animators = mutableListOf<ValueAnimator>()

        // Animate previous indicator: active -> inactive
        if (previousPage in indicatorViews.indices && previousPage != currentPage) {
            val prevIndicator = indicatorViews[previousPage]
            val shrinkAnimator = ValueAnimator.ofInt(activeWidth, inactiveWidth).apply {
                duration = animDuration
                interpolator = AccelerateDecelerateInterpolator()
                addUpdateListener { animator ->
                    val params = prevIndicator.layoutParams as LinearLayout.LayoutParams
                    params.width = animator.animatedValue as Int
                    prevIndicator.layoutParams = params
                }
            }
            prevIndicator.background = ContextCompat.getDrawable(
                requireContext(),
                R.drawable.indicator_inactive
            )
            animators.add(shrinkAnimator)
        }

        // Animate current indicator: inactive -> active
        if (currentPage in indicatorViews.indices) {
            val currIndicator = indicatorViews[currentPage]
            val expandAnimator = ValueAnimator.ofInt(inactiveWidth, activeWidth).apply {
                duration = animDuration
                interpolator = AccelerateDecelerateInterpolator()
                addUpdateListener { animator ->
                    val params = currIndicator.layoutParams as LinearLayout.LayoutParams
                    params.width = animator.animatedValue as Int
                    currIndicator.layoutParams = params
                }
            }
            currIndicator.background = ContextCompat.getDrawable(
                requireContext(),
                R.drawable.indicator_active
            )
            animators.add(expandAnimator)
        }

        if (animators.isNotEmpty()) {
            animatorSet.playTogether(animators as Collection<Animator>)
            animatorSet.start()
        }
    }

    private fun updatePage(animate: Boolean = true) {
        val page = onboardingPages[currentPage]
        binding.onboardingImage.setImageResource(page.imageResId)
        binding.onboardingTitle.text = page.title
        binding.onboardingDescription.text = page.description

        if (animate && indicatorViews.isNotEmpty()) {
            animateIndicators()
        } else {
            setupIndicators()
        }
        previousPage = currentPage
    }

    private fun onComplete() {
        onNextPageListener?.invoke()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        indicatorViews.clear()
        _binding = null
    }
}
