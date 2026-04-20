package com.coremate.opengui.login.login.fragment

import android.animation.ValueAnimator
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.R
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.databinding.FragmentLoginPageBinding

/**
 * 登录/引导首页 — 与 Web NewOnboardingFlow 完全对齐。
 *
 * 10 步: 对话 1-6 → 无障碍 7 → 悬浮窗 8 → 行业选择 9 → 完成 10
 *
 * 关键动画:
 * - TypewriterText: 逐字 + 闪烁光标 (step 1,4,5,6)
 * - Gradient title: 紫色渐变 + 淡入 (step 2,3)
 * - Blue glow: 蓝色呼吸光晕 (step 4 "OpenGUI")
 * - AutomationDemo: 手机模拟自动发帖 (step 5)
 * - PermissionDemo: 无障碍设置动画 / 悬浮窗动画 (step 7,8)
 * - RevealText: 逐行淡入 (描述文字)
 * - History: 0.25/0.4 透明度 + 缩放
 * - Button: 弹簧动画
 */
class LoginPageFragment : Fragment() {

    private var _binding: FragmentLoginPageBinding? = null
    private val binding get() = _binding!!
    private val handler = Handler(Looper.getMainLooper())

    private var onNextPageListener: (() -> Unit)? = null
    fun setOnNextPageListener(listener: () -> Unit) {
        onNextPageListener = listener
    }

    // ── 数据定义 ──

    private data class DialogueStep(
        val subtitle: String?,
        val title: String,
        val description: String?,
        val buttonText: String,
        val isGradient: Boolean,
        val isHighlight: Boolean = false,
        val showCard: Boolean = false,
        val showDemo: Boolean = false,
    )

    private data class IndustryOption(
        val id: String,
        val label: String,
        val bg: String,
        val fg: String
    )

    private val steps = listOf(
        DialogueStep(
            null,
            "欢迎来到OpenGUI 👋",
            "让手机替你工作的旅程\n将从这里开始",
            "开始体验",
            false
        ),
        DialogueStep("你是否每天都在", "重复同样的操作?", null, "是的,太烦了!", true),
        DialogueStep("想让手机自动完成任务", "却不知从何开始?", null, "告诉我怎么做", true),
        DialogueStep(
            "我们为你准备了解决方案:",
            "OpenGUI",
            "只需选择任务,OpenGUI会像你一样\n操作手机,自动完成重复工作",
            "OpenGUI能做什么?",
            false,
            isHighlight = true
        ),
        DialogueStep("OpenGUI可以帮你:", "自动执行任务", null, "我想试试!", false, showDemo = true),
        DialogueStep(
            "要让OpenGUI替你操作手机",
            "需要开启一项特殊能力",
            null,
            "我理解了",
            false,
            showCard = true
        ),
    )

    private val industries = listOf(
        IndustryOption("cross-border-ecommerce", "跨境电商", "#E8F5E9", "#2E7D32"),
        IndustryOption("car-dealer", "车商", "#FFF3E0", "#E65100"),
        IndustryOption("luxury", "奢侈品", "#F3E5F5", "#7B1FA2"),
        IndustryOption("personal-media", "个人自媒体", "#E3F2FD", "#1565C0"),
        IndustryOption("real-estate", "房产经纪", "#FFEBEE", "#C62828"),
        IndustryOption("insurance", "保险经纪", "#E0F7FA", "#00838F"),
        IndustryOption("wedding", "婚庆服务", "#FCE4EC", "#AD1457"),
        IndustryOption("headhunting", "猎头咨询", "#FFF8E1", "#FF8F00"),
        IndustryOption("legal", "法律咨询", "#ECEFF1", "#455A64"),
        IndustryOption("education", "教育", "#E8EAF6", "#303F9F"),
    )
    private val industryRows = listOf(
        industries.slice(0..1),
        industries.slice(2..4),
        industries.slice(5..7),
        industries.slice(8..9)
    )

    // ── 状态 ──

    private var currentStep = 1
    private val history = mutableListOf<Int>()
    private var accessibilityEnabled = false
    private var overlayEnabled = false
    private val selectedScenes = mutableSetOf<String>()
    private var skipConfirmed = false
    private val pendingRunnables = mutableListOf<Runnable>()
    private var glowAnimator: ValueAnimator? = null
    private var automationDemoView: AutomationDemoView? = null
    private var permissionDemoView: View? = null
    private var permDemoHandler: Handler? = null

    // ── 生命周期 ──

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentLoginPageBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.vStatus.layoutParams.height = AMScreenUtils.getStatusBarHeight()
        binding.btnNext.setOnClickListener { onBottomButtonClick() }
        binding.btnSkip.setOnClickListener { handleSkip() }
        refreshUi(false)
    }

    override fun onResume() {
        super.onResume()
        if (currentStep == 7 || currentStep == 8) checkPermissions()
    }

    override fun onDestroyView() {
        clearPending()
        glowAnimator?.cancel()
        automationDemoView?.stop()
        permDemoHandler?.removeCallbacksAndMessages(null)
        super.onDestroyView()
        _binding = null
    }

    private fun clearPending() {
        pendingRunnables.forEach { handler.removeCallbacks(it) }
        pendingRunnables.clear()
    }

    private fun postDelayed(delay: Long, action: () -> Unit) {
        val r = Runnable { if (_binding != null) action() }
        pendingRunnables.add(r)
        handler.postDelayed(r, delay)
    }

    // ── 权限 ──

    private fun checkPermissions() {
        accessibilityEnabled = isAccessibilityServiceEnabled(requireContext())
        overlayEnabled =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(
                requireContext()
            ) else true
        refreshUi(false)
    }

    private fun isAccessibilityServiceEnabled(ctx: Context): Boolean {
        val svc = "${ctx.packageName}/${GestureService::class.java.canonicalName}"
        return Settings.Secure.getString(
            ctx.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )?.contains(svc) == true
    }

    // ── 交互 ──

    private fun onBottomButtonClick() {
        when {
            currentStep <= 6 -> {
                history.add(currentStep); currentStep++; skipConfirmed = false; refreshUi(true)
            }

            currentStep == 7 -> if (accessibilityEnabled) {
                currentStep = if (overlayEnabled) 9 else 8; refreshUi(true)
            } else openAccessibility()

            currentStep == 8 -> if (overlayEnabled) {
                currentStep = 9; refreshUi(true)
            } else openOverlay()

            currentStep == 9 -> {
                currentStep = 10; refreshUi(true)
            }

            currentStep == 10 -> onNextPageListener?.invoke()
        }
    }

    private fun openAccessibility() {
        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
    }

    private fun openOverlay() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                data =
                    Uri.parse("package:${requireContext().packageName}"); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
    }

    private fun handleSkip() {
        if (skipConfirmed) {
            onNextPageListener?.invoke(); return
        }
        skipConfirmed = true
        binding.btnSkip.text = "仍要跳过"
        binding.btnSkip.setTextColor(
            ContextCompat.getColor(
                requireContext(),
                android.R.color.holo_red_dark
            )
        )
        binding.skipToast.visibility = View.VISIBLE
        binding.skipToast.alpha = 0f
        binding.skipToast.animate().alpha(1f).setDuration(200).start()
        postDelayed(2500) {
            binding.skipToast.animate().alpha(0f).setDuration(200)
                .withEndAction { if (_binding != null) binding.skipToast.visibility = View.GONE }
                .start()
        }
    }

    // ── UI ──

    private fun refreshUi(anim: Boolean) {
        clearPending()
        glowAnimator?.cancel()
        automationDemoView?.stop()
        permDemoHandler?.removeCallbacksAndMessages(null)
        binding.skipButtonContainer.visibility =
            if (currentStep in 7..8) View.VISIBLE else View.GONE
        when {
            currentStep <= 6 -> showDialogue(anim)
            currentStep in 7..8 -> showPermission(anim)
            currentStep == 9 -> showIndustry(anim)
            currentStep == 10 -> showComplete(anim)
        }
        updateButton(anim)
    }

    // ═══════════════════════════════════════
    //  对话步骤 1-6
    // ═══════════════════════════════════════

    private fun showDialogue(anim: Boolean) {
        showOnly(dialogue = true)
        val step = steps[currentStep - 1]

        // ── 清除上一步的渐变 shader ──
        binding.dialogueTitle.paint.shader = null

        buildHistory(anim)

        // 副标题
        binding.dialogueSubtitle.visibility = if (step.subtitle != null) View.VISIBLE else View.GONE
        binding.dialogueSubtitle.text = step.subtitle

        // ── 标题 ──
        when {
            step.isGradient -> showGradientTitle(step.title, anim)
            step.isHighlight -> showGlowTitle(step.title, anim)
            else -> {
                binding.dialogueTitle.setTextColor(0xFF111827.toInt())
                if (anim) startTypewriter(binding.dialogueTitle, step.title, 150L, 40L)
                else binding.dialogueTitle.text = step.title
            }
        }

        // 描述
        binding.dialogueDescription.visibility =
            if (step.description != null) View.VISIBLE else View.GONE
        if (step.description != null) {
            if (anim) revealLines(binding.dialogueDescription, step.description, 600L)
            else binding.dialogueDescription.text = step.description
        }

        // 权限卡片 (step 6)
        binding.cardPermissionIntro.visibility = if (step.showCard) View.VISIBLE else View.GONE
        if (step.showCard && anim) {
            binding.cardPermissionIntro.alpha = 0f; binding.cardPermissionIntro.translationY =
                dp(20f)
            binding.cardPermissionIntro.animate().alpha(1f).translationY(0f).setDuration(400)
                .setStartDelay(200).setInterpolator(DecelerateInterpolator()).start()
        }

        // AutomationDemo (step 5)
        if (step.showDemo) showAutomationDemo(anim) else hideAutomationDemo()

        // 整体淡入
        if (anim) {
            binding.currentContent.alpha = 0f; binding.currentContent.translationY = dp(30f)
            binding.currentContent.animate().alpha(1f).translationY(0f).setDuration(400)
                .setInterpolator(DecelerateInterpolator()).start()
            if (step.subtitle != null) {
                binding.dialogueSubtitle.alpha = 0f; binding.dialogueSubtitle.translationY = dp(10f)
                binding.dialogueSubtitle.animate().alpha(0.8f).translationY(0f).setDuration(400)
                    .setStartDelay(100).setInterpolator(DecelerateInterpolator()).start()
            }
        } else {
            binding.currentContent.alpha = 1f; binding.currentContent.translationY = 0f
        }
    }

    // ── 历史 ──
    private fun buildHistory(anim: Boolean) {
        val vis = history.takeLast(2)
        if (vis.isEmpty()) {
            binding.historyContainer.visibility = View.GONE; return
        }
        binding.historyContainer.visibility = View.VISIBLE
        binding.historyContainer.removeAllViews()
        vis.forEachIndexed { i, num ->
            val h = steps[num - 1];
            val old = i == 0 && vis.size > 1
            val ta = if (old) 0.25f else 0.4f;
            val ts = if (old) 0.95f else 0.98f
            val row = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.VERTICAL; setPadding(0, 0, 0, dpI(12)); pivotX = 0f
            }
            if (h.subtitle != null) row.addView(TextView(requireContext()).apply {
                text = h.subtitle; setTextColor(0xFF9CA3AF.toInt()); textSize = 14f; setPadding(
                0,
                0,
                0,
                dpI(2)
            )
            })
            row.addView(TextView(requireContext()).apply {
                text = h.title; setTextColor(0xFF9CA3AF.toInt()); textSize = 20f; setTypeface(
                null,
                Typeface.BOLD
            )
            })
            binding.historyContainer.addView(row)
            if (anim) {
                row.alpha = 0f; row.translationY = dp(20f); row.animate().alpha(ta).translationY(0f)
                    .scaleX(ts).scaleY(ts).setDuration(400)
                    .setInterpolator(DecelerateInterpolator()).start()
            } else {
                row.alpha = ta; row.scaleX = ts; row.scaleY = ts
            }
        }
    }

    // ── TypewriterText ──
    private fun startTypewriter(tv: TextView, text: String, delay: Long, speed: Long) {
        tv.paint.shader = null  // 确保清除渐变
        tv.text = "";
        var idx = 0
        val r = object : Runnable {
            override fun run() {
                if (_binding == null) return
                if (idx < text.length) {
                    tv.text = text.substring(0, ++idx) + "│"; handler.postDelayed(this, speed)
                } else {
                    tv.text = "$text│"; startBlink(tv, text)
                }
            }
        }
        pendingRunnables.add(r); handler.postDelayed(r, delay)
    }

    private fun startBlink(tv: TextView, text: String) {
        var on = true
        val r = object : Runnable {
            override fun run() {
                if (_binding == null) return; on = !on; tv.text =
                    if (on) "$text│" else text; handler.postDelayed(this, 500)
            }
        }
        pendingRunnables.add(r); handler.postDelayed(r, 500)
    }

    // ── 渐变标题 (step 2,3): 紫色 #6366F1→#8B5CF6→#A855F7 ──
    private fun showGradientTitle(text: String, anim: Boolean) {
        binding.dialogueTitle.text = text
        binding.dialogueTitle.post {
            if (_binding == null) return@post
            val w = binding.dialogueTitle.paint.measureText(text)
            binding.dialogueTitle.paint.shader = LinearGradient(
                0f,
                0f,
                w,
                0f,
                intArrayOf(0xFF6366F1.toInt(), 0xFF8B5CF6.toInt(), 0xFFA855F7.toInt()),
                null,
                Shader.TileMode.CLAMP
            )
            binding.dialogueTitle.invalidate()
        }
        if (anim) {
            binding.dialogueTitle.alpha = 0f; binding.dialogueTitle.translationY = dp(20f)
            binding.dialogueTitle.animate().alpha(1f).translationY(0f).setDuration(600)
                .setStartDelay(200).setInterpolator(DecelerateInterpolator()).start()
        } else {
            binding.dialogueTitle.alpha = 1f; binding.dialogueTitle.translationY = 0f
        }
    }

    // ── 蓝色光晕标题 (step 4 "OpenGUI"): text-glow-blue 呼吸动画 ──
    private fun showGlowTitle(text: String, anim: Boolean) {
        binding.dialogueTitle.paint.shader = null
        binding.dialogueTitle.setTextColor(0xFF111827.toInt())
        // 开启软件渲染以支持 setShadowLayer
        binding.dialogueTitle.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
        if (anim) {
            startTypewriter(binding.dialogueTitle, text, 300L, 100L)
            // 延迟到打字完成后启动呼吸光晕
            val totalTime = 300L + text.length * 100L + 200L
            postDelayed(totalTime) { startGlowBreathing() }
        } else {
            binding.dialogueTitle.text = text
            startGlowBreathing()
        }
    }

    /** blue-glow-pulse: 0→50→0 半径呼吸, 蓝色阴影 */
    private fun startGlowBreathing() {
        glowAnimator?.cancel()
        glowAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 2000L; repeatMode = ValueAnimator.REVERSE; repeatCount =
            ValueAnimator.INFINITE
            addUpdateListener { va ->
                if (_binding == null) return@addUpdateListener
                val f = va.animatedValue as Float
                val radius = 10f + f * 40f  // 10→50
                val alpha = (0.4f + f * 0.2f) // 0.4→0.6
                val color = Color.argb((alpha * 255).toInt(), 46, 88, 255)
                binding.dialogueTitle.setShadowLayer(radius, 0f, 0f, color)
            }
            start()
        }
    }

    // ── RevealText: 逐行淡入 ──
    private fun revealLines(tv: TextView, text: String, baseDelay: Long) {
        val lines = text.split("\n"); tv.text = ""; tv.alpha = 1f
        lines.forEachIndexed { i, line ->
            postDelayed(baseDelay + i * 150L) {
                tv.text = if (tv.text.isEmpty()) line else "${tv.text}\n$line"
            }
        }
    }

    // ═══════════════════════════════════════
    //  AutomationDemo (step 5)
    //  模拟手机自动发帖: 手机框 + 点击App → 打开编辑 → 输入 → 发布 → 成功
    // ═══════════════════════════════════════

    private fun showAutomationDemo(anim: Boolean) {
        binding.automationDemoContainer.visibility = View.VISIBLE
        if (automationDemoView == null) {
            automationDemoView = AutomationDemoView(requireContext())
            binding.automationDemoContainer.addView(
                automationDemoView,
                FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dpI(280))
                    .apply { gravity = Gravity.CENTER })
        }
        automationDemoView?.start()
        if (anim) {
            binding.automationDemoContainer.alpha =
                0f; binding.automationDemoContainer.translationY = dp(20f)
            binding.automationDemoContainer.animate().alpha(1f).translationY(0f).setDuration(400)
                .setStartDelay(300).setInterpolator(DecelerateInterpolator()).start()
        }
    }

    private fun hideAutomationDemo() {
        binding.automationDemoContainer.visibility = View.GONE
        automationDemoView?.stop()
    }

    // ═══════════════════════════════════════
    //  PermissionDemo (step 7, 8)
    // ═══════════════════════════════════════

    private fun showPermission(anim: Boolean) {
        showOnly(permission = true)
        val isAcc = currentStep == 7
        binding.permDot1.setBackgroundResource(if (isAcc) R.drawable.dot_rounded_blue else R.drawable.dot_rounded_green)
        binding.permDot2.setBackgroundResource(if (currentStep == 8) R.drawable.dot_rounded_green else R.drawable.dot_rounded_gray)
        binding.permIconContainer.setBackgroundResource(if (isAcc) R.drawable.bg_gradient_blue_rounded else R.drawable.bg_gradient_green_rounded)
        binding.permIcon.setImageResource(if (isAcc) R.drawable.ic_accessibility_perm else R.drawable.ic_overlay_perm)
        binding.permTitle.text = if (isAcc) "让OpenGUI帮你操控手机" else "随时查看任务进度"
        binding.permSubtitle.text =
            if (isAcc) "开启后，OpenGUI可以自动帮你完成任务" else "开启后，你可以实时看到执行状态"

        showPermissionDemo(isAcc)

        if (anim) {
            binding.permissionContainer.alpha = 0f; binding.permissionContainer.translationX =
                dp(20f)
            binding.permissionContainer.animate().alpha(1f).translationX(0f).setDuration(300)
                .setInterpolator(DecelerateInterpolator()).start()
        } else {
            binding.permissionContainer.alpha = 1f; binding.permissionContainer.translationX = 0f
        }
    }

    private fun showPermissionDemo(isAccessibility: Boolean) {
        binding.permissionDemoContainer.removeAllViews()
        permDemoHandler?.removeCallbacksAndMessages(null)
        permDemoHandler = Handler(Looper.getMainLooper())

        if (isAccessibility) {
            val demo = AccessibilityDemoView(requireContext())
            binding.permissionDemoContainer.addView(
                demo,
                FrameLayout.LayoutParams(dpI(200), dpI(280)).apply { gravity = Gravity.CENTER })
            demo.startAnimation(permDemoHandler!!)
            permissionDemoView = demo
        } else {
            val demo = OverlayDemoView(requireContext())
            binding.permissionDemoContainer.addView(
                demo,
                FrameLayout.LayoutParams(dpI(200), dpI(280)).apply { gravity = Gravity.CENTER })
            demo.startAnimation(permDemoHandler!!)
            permissionDemoView = demo
        }
    }

    // ═══════════════════════════════════════
    //  行业选择 step 9
    // ═══════════════════════════════════════

    private fun showIndustry(anim: Boolean) {
        showOnly(industry = true)
        buildTags()
        binding.industrySelectedCount.visibility =
            if (selectedScenes.isNotEmpty()) View.VISIBLE else View.GONE
        binding.industrySelectedCount.text = "已选择 ${selectedScenes.size} 个行业"
        if (anim) {
            binding.industryContainer.alpha = 0f; binding.industryContainer.animate().alpha(1f)
                .setDuration(300).start()
        } else binding.industryContainer.alpha = 1f
    }

    private fun buildTags() {
        val c = binding.industryTagsContainer; c.removeAllViews()
        var gi = 0
        industryRows.forEach { row ->
            val rl = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER
            }
            row.forEach { opt ->
                val sel = selectedScenes.contains(opt.id)
                val chip = TextView(requireContext()).apply {
                    text = opt.label; textSize = 15f; setTypeface(
                    null,
                    Typeface.BOLD
                )
                    setPadding(dpI(16), dpI(10), dpI(16), dpI(10))
                    background = GradientDrawable().apply {
                        setColor(
                            if (sel) 0xFF2E58FF.toInt() else Color.parseColor(opt.bg)
                        ); cornerRadius = 999f
                    }
                    setTextColor(if (sel) Color.WHITE else Color.parseColor(opt.fg))
                    elevation = if (sel) dp(6f) else dp(2f)
                    setOnClickListener {
                        if (selectedScenes.contains(opt.id)) selectedScenes.remove(opt.id) else selectedScenes.add(
                            opt.id
                        ); buildTags()
                        binding.industrySelectedCount.visibility =
                            if (selectedScenes.isNotEmpty()) View.VISIBLE else View.GONE
                        binding.industrySelectedCount.text = "已选择 ${selectedScenes.size} 个行业"
                    }
                }
                rl.addView(
                    chip,
                    LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { setMargins(dpI(6), dpI(2), dpI(6), dpI(2)) })
                gi++
            }
            c.addView(
                rl,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = dpI(12) })
        }
    }

    // ═══════════════════════════════════════
    //  完成 step 10
    // ═══════════════════════════════════════

    private fun showComplete(anim: Boolean) {
        showOnly(complete = true)
        if (anim) {
            binding.completeCheckmark.scaleX = 0f; binding.completeCheckmark.scaleY = 0f
            binding.completeCheckmark.animate().scaleX(1f).scaleY(1f).setDuration(500)
                .setStartDelay(100).setInterpolator(OvershootInterpolator(2f)).start()
            for (i in 0 until binding.completeContainer.childCount) {
                val ch =
                    binding.completeContainer.getChildAt(i); if (ch == binding.completeCheckmark) continue
                ch.alpha = 0f; ch.translationY = dp(20f)
                ch.animate().alpha(1f).translationY(0f).setDuration(400)
                    .setStartDelay(500L + i * 100L).setInterpolator(DecelerateInterpolator())
                    .start()
            }
        }
    }

    // ── 按钮 ──

    private fun updateButton(anim: Boolean) {
        binding.btnNext.text = when {
            currentStep <= 6 -> steps[currentStep - 1].buttonText
            currentStep == 7 -> if (accessibilityEnabled) "继续" else "去设置开启"
            currentStep == 8 -> if (overlayEnabled) "继续" else "继续开启"
            currentStep == 9 -> "继续"
            else -> "进入OpenGUI"
        }
        binding.btnNext.setBackgroundResource(if (currentStep == 10) R.drawable.rounded_green_button else R.drawable.bg_btn_primary_shadow)
        if (anim) {
            binding.btnNext.alpha = 0f; binding.btnNext.translationY = dp(20f)
            binding.btnNext.animate().alpha(1f).translationY(0f).setDuration(300).setStartDelay(100)
                .setInterpolator(OvershootInterpolator(1.5f)).start()
        }
    }

    // ── 容器切换 ──

    private fun showOnly(
        dialogue: Boolean = false,
        permission: Boolean = false,
        industry: Boolean = false,
        complete: Boolean = false
    ) {
        binding.dialogueContainer.visibility = if (dialogue) View.VISIBLE else View.GONE
        binding.permissionContainer.visibility = if (permission) View.VISIBLE else View.GONE
        binding.industryContainer.visibility = if (industry) View.VISIBLE else View.GONE
        binding.completeContainer.visibility = if (complete) View.VISIBLE else View.GONE
    }

    // ── 工具 ──
    private fun dp(v: Float) = v * resources.displayMetrics.density
    private fun dpI(v: Int) = (v * resources.displayMetrics.density + 0.5f).toInt()

    // ═══════════════════════════════════════════════════════════════
    //  AutomationDemoView — 手机模拟自动发帖动画 (对齐 Web AutomationDemo)
    //  手机框 + 状态栏 + 主屏 → X编辑(header: ✕/Drafts/Post + 输入 + 底部3图标) → 发布成功
    // ═══════════════════════════════════════════════════════════════

    private inner class AutomationDemoView(ctx: Context) : View(ctx) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        private val r = RectF()
        private var phase = 0  // 0~6 循环
        private var running = false
        private val sequence = listOf(800L, 600L, 700L, 500L, 1200L, 400L, 1500L)
        private val d = resources.displayMetrics.density

        fun start() {
            running = true; phase = 0; nextPhase()
        }

        fun stop() {
            running = false;
            if (handler != null) {
                handler.removeCallbacksAndMessages(null)
            }
        }

        private fun nextPhase() {
            if (!running || _binding == null) return
            invalidate()
            handler.postDelayed({
                phase = (phase + 1) % 7
                nextPhase()
            }, sequence[phase])
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val w = width.toFloat();
            val h = height.toFloat()
            val phoneW = 220 * d;
            val phoneH = 270 * d
            val px = (w - phoneW) / 2;
            val py = (h - phoneH) / 2

            // 手机外框 (dark border)
            p.color = 0xFF333333.toInt(); p.style = Paint.Style.STROKE; p.strokeWidth = 2 * d
            r.set(px, py, px + phoneW, py + phoneH)
            canvas.drawRoundRect(r, 28 * d, 28 * d, p)
            p.color = 0xFF1A1A1A.toInt(); p.style = Paint.Style.FILL
            r.set(px + d, py + d, px + phoneW - d, py + phoneH - d)
            canvas.drawRoundRect(r, 28 * d, 28 * d, p)

            // 屏幕
            val sx = px + 5 * d;
            val sy = py + 5 * d;
            val sw = phoneW - 10 * d;
            val sh = phoneH - 10 * d
            p.color = 0xFF0A0A0A.toInt()
            r.set(sx, sy, sx + sw, sy + sh)
            canvas.drawRoundRect(r, 24 * d, 24 * d, p)
            canvas.save()
            canvas.clipRect(sx, sy, sx + sw, sy + sh)

            // Dynamic Island
            p.color = 0xFF000000.toInt()
            val diW = 70 * d;
            val diH = 20 * d
            r.set(sx + (sw - diW) / 2, sy + 4 * d, sx + (sw + diW) / 2, sy + 4 * d + diH)
            canvas.drawRoundRect(r, diH / 2, diH / 2, p)

            // 状态栏: 9:41 + 信号/WiFi/电量
            p.color = Color.WHITE; p.textSize = 9 * d; p.textAlign = Paint.Align.LEFT
            p.setTypeface(Typeface.DEFAULT_BOLD)
            canvas.drawText("9:41", sx + 12 * d, sy + 15 * d, p)
            p.setTypeface(Typeface.DEFAULT)

            // 信号柱
            val sigX = sx + sw - 60 * d;
            val sigY = sy + 8 * d
            p.color = 0x80FFFFFF.toInt()
            for (i in 0..2) {
                val bh = (4 + i * 2) * d;
                val bw = 3 * d;
                val bx = sigX + i * 5 * d
                if (i == 2) p.color = Color.WHITE
                r.set(bx, sigY + 8 * d - bh, bx + bw, sigY + 8 * d)
                canvas.drawRoundRect(r, d, d, p)
            }

            // WiFi 三角
            p.color = 0xCCFFFFFF.toInt()
            val wifiX = sigX + 18 * d;
            val wifiY = sigY + 2 * d
            val path = Path()
            path.moveTo(wifiX, wifiY + 6 * d); path.lineTo(
                wifiX + 5 * d,
                wifiY
            ); path.lineTo(wifiX + 10 * d, wifiY + 6 * d); path.close()
            canvas.drawPath(path, p)

            // 电量
            p.color = Color.WHITE; p.style = Paint.Style.STROKE; p.strokeWidth = 0.8f * d
            val batX = sigX + 32 * d
            r.set(batX, sigY + 1 * d, batX + 16 * d, sigY + 8 * d)
            canvas.drawRoundRect(r, 1.5f * d, 1.5f * d, p)
            p.style = Paint.Style.FILL
            r.set(batX + 1.5f * d, sigY + 2.5f * d, batX + 12 * d, sigY + 6.5f * d)
            canvas.drawRoundRect(r, d, d, p)
            // 电量头
            p.color = 0x66FFFFFF.toInt()
            r.set(batX + 16 * d, sigY + 3 * d, batX + 17.5f * d, sigY + 6 * d)
            canvas.drawRoundRect(r, d, d, p)

            if (phase < 2) {
                drawHomeScreen(canvas, sx, sy, sw, sh)
            } else {
                drawComposeScreen(canvas, sx, sy, sw, sh)
            }

            // 触摸指示器
            if (phase == 1 || phase == 3 || phase == 5) {
                drawTouchIndicator(canvas, sx, sy, sw, sh)
            }

            // 成功标签 (phase 6) — 右上角蓝色 pill
            if (phase == 6) {
                p.color = 0xFF1D9BF0.toInt(); p.style = Paint.Style.FILL
                val tagW = 58 * d;
                val tagH = 18 * d
                val tagX = sx + sw - tagW - 8 * d;
                val tagY = sy + 32 * d
                r.set(tagX, tagY, tagX + tagW, tagY + tagH)
                canvas.drawRoundRect(r, tagH / 2, tagH / 2, p)
                p.color = Color.WHITE; p.textSize = 8.5f * d; p.textAlign = Paint.Align.CENTER
                p.setTypeface(Typeface.DEFAULT_BOLD)
                canvas.drawText("✓ 已发布", r.centerX(), r.centerY() + 3 * d, p)
                p.setTypeface(Typeface.DEFAULT)
            }

            // Home Indicator
            p.color = 0x4DFFFFFF.toInt()
            val barW = 80 * d;
            val barH = 3 * d
            r.set(
                sx + (sw - barW) / 2,
                sy + sh - 6 * d,
                sx + (sw + barW) / 2,
                sy + sh - 6 * d + barH
            )
            canvas.drawRoundRect(r, barH / 2, barH / 2, p)

            canvas.restore()
        }

        private fun drawHomeScreen(canvas: Canvas, sx: Float, sy: Float, sw: Float, sh: Float) {
            val iconSize = 38 * d;
            val gap = 8 * d
            val totalW = 4 * iconSize + 3 * gap
            val startX = sx + (sw - totalW) / 2;
            val iy = sy + 55 * d

            // X app (full opacity)
            val scale = if (phase == 1) 0.9f else 1f
            val cx = startX + iconSize / 2;
            val cy = iy + iconSize / 2
            canvas.save()
            canvas.scale(scale, scale, cx, cy)
            p.color = 0xFF000000.toInt(); p.style = Paint.Style.FILL
            r.set(startX, iy, startX + iconSize, iy + iconSize)
            canvas.drawRoundRect(r, 11 * d, 11 * d, p)
            p.color = Color.WHITE; p.textSize = 18 * d; p.textAlign = Paint.Align.CENTER
            canvas.drawText("𝕏", r.centerX(), r.centerY() + 6 * d, p)
            canvas.restore()
            // label
            p.color = 0xCCFFFFFF.toInt(); p.textSize = 7.5f * d
            canvas.drawText("X", startX + iconSize / 2, iy + iconSize + 11 * d, p)

            // Other apps (faded)
            data class AppInfo(val color: Int, val label: String)

            val apps = listOf(
                AppInfo(0xFF833AB4.toInt(), "Instagram"),
                AppInfo(0xFFFF0000.toInt(), "YouTube"),
                AppInfo(0xFF25D366.toInt(), "WhatsApp")
            )
            apps.forEachIndexed { i, app ->
                val ix = startX + (i + 1) * (iconSize + gap)
                p.color = (app.color.toLong() and 0x00FFFFFF or 0x66000000).toInt()
                p.style = Paint.Style.FILL
                r.set(ix, iy, ix + iconSize, iy + iconSize)
                canvas.drawRoundRect(r, 11 * d, 11 * d, p)
                // label
                p.color = 0x99FFFFFF.toInt(); p.textSize = 7.5f * d; p.textAlign =
                Paint.Align.CENTER
                canvas.drawText(app.label, ix + iconSize / 2, iy + iconSize + 11 * d, p)
            }
        }

        private fun drawComposeScreen(
            canvas: Canvas,
            sx: Float,
            sy: Float,
            sw: Float,
            sh: Float
        ) {
            val bgTop = sy + 26 * d
            val radius = 18 * d

            // ── Black background with bottom rounded corners ──
            val bgPath = Path()
            bgPath.addRoundRect(
                RectF(
                    sx,
                    bgTop,
                    sx + sw,
                    sy + sh
                ),
                floatArrayOf(
                    0f, 0f,          // 左上
                    0f, 0f,          // 右上
                    radius, radius,  // 右下
                    radius, radius   // 左下
                ),
                Path.Direction.CW
            )
            p.color = 0xFF000000.toInt()
            p.style = Paint.Style.FILL
            canvas.drawPath(bgPath, p)

            // ── Compose header ──
            val headerY = sy + 28 * d
            val headerH = 24 * d

            p.color = 0xFF000000.toInt()
            canvas.drawRect(sx, headerY, sx + sw, headerY + headerH, p)

            // header bottom divider
            p.color = 0x1AFFFFFF.toInt()
            canvas.drawRect(
                sx,
                headerY + headerH - d,
                sx + sw,
                headerY + headerH,
                p
            )

            // ✕ close icon
            p.color = Color.WHITE
            p.style = Paint.Style.STROKE
            p.strokeWidth = 1.5f * d
            p.strokeCap = Paint.Cap.ROUND
            val clX = sx + 12 * d
            val clY = headerY + headerH / 2
            canvas.drawLine(clX - 4 * d, clY - 4 * d, clX + 4 * d, clY + 4 * d, p)
            canvas.drawLine(clX + 4 * d, clY - 4 * d, clX - 4 * d, clY + 4 * d, p)
            p.style = Paint.Style.FILL

            // Drafts title
            p.color = 0x99FFFFFF.toInt()
            p.textSize = 8.5f * d
            p.textAlign = Paint.Align.CENTER
            p.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText(
                "Drafts",
                sx + sw / 2,
                headerY + headerH / 2 + 3 * d,
                p
            )
            p.typeface = Typeface.DEFAULT

            // Post button
            val postAlpha = if (phase >= 4) 1f else 0.5f
            val postScale = if (phase == 5) 0.9f else 1f
            val postW = 40 * d
            val postH = 17 * d
            val postX = sx + sw - postW - 8 * d
            val postY = headerY + (headerH - postH) / 2

            canvas.save()
            canvas.scale(postScale, postScale, postX + postW / 2, postY + postH / 2)
            p.color = if (phase >= 4) {
                0xFF1D9BF0.toInt()
            } else {
                ((postAlpha * 255).toInt() shl 24) or 0x001D9BF0
            }
            r.set(postX, postY, postX + postW, postY + postH)
            canvas.drawRoundRect(r, postH / 2, postH / 2, p)

            p.color = Color.WHITE
            p.textSize = 8.5f * d
            p.textAlign = Paint.Align.CENTER
            p.typeface = Typeface.DEFAULT_BOLD
            canvas.drawText("Post", r.centerX(), r.centerY() + 3 * d, p)
            p.typeface = Typeface.DEFAULT
            canvas.restore()

            // ── Compose body ──
            val bodyY = headerY + headerH + 6 * d

            // Avatar
            val avR = 12 * d
            val avCx = sx + 14 * d + avR
            val avCy = bodyY + avR
            val gradient = LinearGradient(
                avCx - avR,
                avCy - avR,
                avCx + avR,
                avCy + avR,
                0xFF1D9BF0.toInt(),
                0xFF8B5CF6.toInt(),
                Shader.TileMode.CLAMP
            )
            p.shader = gradient
            canvas.drawCircle(avCx, avCy, avR, p)
            p.shader = null

            // Text input
            val textX = avCx + avR + 8 * d
            val textY = bodyY + 4 * d
            p.textAlign = Paint.Align.LEFT
            p.textSize = 9 * d

            if (phase >= 4) {
                p.color = 0xFFFFFFFF.toInt()
                canvas.drawText("刚完成了今日的工作目标 🎯", textX, textY + 10 * d, p)
                canvas.drawText("效率提升了50%！", textX, textY + 24 * d, p)
                p.color = 0xCCFFFFFF.toInt()
                canvas.drawText("#高效工作 #自动化", textX, textY + 38 * d, p)
            } else {
                p.color = if (phase >= 3) 0x80FFFFFF.toInt() else 0x4DFFFFFF.toInt()
                canvas.drawText("What's happening?", textX, textY + 10 * d, p)
            }

            // Cursor
            if (phase in 3..4) {
                p.color = 0xFF1D9BF0.toInt()
                val cursorX =
                    if (phase == 4) textX + p.measureText("效率提升了50%！") else textX
                canvas.drawRect(
                    cursorX,
                    textY + if (phase == 4) 17 * d else 2 * d,
                    cursorX + 1.2f * d,
                    textY + if (phase == 4) 29 * d else 14 * d,
                    p
                )
            }

            // ── Bottom toolbar ──
            val tbY = sy + sh - 22 * d

            // divider (clipped to avoid rounded corners)
            canvas.save()
            canvas.clipRect(sx, bgTop, sx + sw, sy + sh - radius)
            p.color = 0x1AFFFFFF.toInt()
            canvas.drawRect(sx, tbY - 2 * d, sx + sw, tbY - d, p)
            canvas.restore()

            val iconColor = 0xFF1D9BF0.toInt()
            val iconSz = 10 * d
            var iconX = sx + 12 * d
            val iconCy = tbY + 6 * d

            // Image icon
            p.color = iconColor
            p.style = Paint.Style.STROKE
            p.strokeWidth = 1.2f * d
            r.set(iconX, iconCy - iconSz / 2, iconX + iconSz, iconCy + iconSz / 2)
            canvas.drawRoundRect(r, 1.5f * d, 1.5f * d, p)
            p.style = Paint.Style.FILL
            canvas.drawCircle(iconX + 3.5f * d, iconCy - 1.5f * d, 1.2f * d, p)
            val mPath = Path()
            mPath.moveTo(iconX + iconSz, iconCy + 2 * d)
            mPath.lineTo(iconX + iconSz - 3.5f * d, iconCy - 2 * d)
            mPath.lineTo(iconX + 2 * d, iconCy + iconSz / 2)
            canvas.drawPath(mPath, p)

            // Clock icon
            iconX += 20 * d
            p.style = Paint.Style.STROKE
            canvas.drawCircle(iconX + iconSz / 2, iconCy, iconSz / 2, p)
            canvas.drawLine(
                iconX + iconSz / 2,
                iconCy - 2.5f * d,
                iconX + iconSz / 2,
                iconCy,
                p
            )
            canvas.drawLine(
                iconX + iconSz / 2,
                iconCy,
                iconX + iconSz / 2 + 2 * d,
                iconCy + 2 * d,
                p
            )

            // Location icon
            iconX += 20 * d
            val pinPath = Path()
            pinPath.moveTo(iconX + iconSz / 2, iconCy + iconSz / 2)
            pinPath.lineTo(iconX + iconSz / 2 - 3 * d, iconCy - 1 * d)
            pinPath.quadTo(
                iconX + iconSz / 2,
                iconCy - iconSz / 2 - 2 * d,
                iconX + iconSz / 2 + 3 * d,
                iconCy - 1 * d
            )
            pinPath.close()
            canvas.drawPath(pinPath, p)
            p.style = Paint.Style.FILL
            canvas.drawCircle(iconX + iconSz / 2, iconCy - 1.5f * d, 1.5f * d, p)
        }

        private fun drawTouchIndicator(canvas: Canvas, sx: Float, sy: Float, sw: Float, sh: Float) {
            val tx: Float;
            val ty: Float
            val iconSize = 38 * d;
            val gap = 8 * d;
            val totalW = 4 * iconSize + 3 * gap
            val startX = sx + (sw - totalW) / 2
            when (phase) {
                1 -> {
                    tx = startX + iconSize / 2; ty = sy + 55 * d + iconSize / 2
                } // X app center
                3 -> {
                    tx = sx + sw / 2; ty = sy + 64 * d
                } // input area
                5 -> {
                    tx = sx + sw - 28 * d; ty = sy + 40 * d
                } // Post btn
                else -> return
            }
            // Outer ripple
            p.color = 0x30FFFFFF.toInt(); p.style = Paint.Style.FILL
            canvas.drawCircle(tx, ty, 16 * d, p)
            // Inner glow
            p.color = 0x99FFFFFF.toInt()
            canvas.drawCircle(tx, ty, 8 * d, p)
            // Core dot
            p.color = 0xFFFFFFFF.toInt()
            canvas.drawCircle(tx, ty, 3 * d, p)
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  AccessibilityDemoView — 无障碍设置页面翻页动画 (对齐 Web PermissionDemo accessibility)
    //  模拟 MIUI: 无障碍主页 → 已下载应用列表 → OpenGUI详情页 → 开关开启
    //  完全对齐 Web 实现: 每个列表项带副标题, 开关, 箭头; 详情页带选项/简介
    // ═══════════════════════════════════════════════════════════════

    private inner class AccessibilityDemoView(ctx: Context) : View(ctx) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        private val r = RectF()
        private val d = resources.displayMetrics.density
        private var step = 0 // 0~4 循环

        fun startAnimation(h: Handler) {
            step = 0; invalidate()
            val tick = object : Runnable {
                override fun run() {
                    if (_binding == null) return
                    step = (step + 1) % 5; invalidate()
                    h.postDelayed(this, 2000)
                }
            }
            h.postDelayed(tick, 2000)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val w = width.toFloat();
            val h = height.toFloat()

            // 手机框 白色圆角 + 灰边
            p.color = Color.WHITE; p.style = Paint.Style.FILL
            r.set(0f, 0f, w, h)
            canvas.drawRoundRect(r, 16 * d, 16 * d, p)
            p.color = 0xFFE5E7EB.toInt(); p.style = Paint.Style.STROKE; p.strokeWidth = d
            canvas.drawRoundRect(r, 16 * d, 16 * d, p)
            p.style = Paint.Style.FILL

            canvas.save()
            canvas.clipRect(0f, 0f, w, h)

            val page = if (step <= 1) 0 else if (step == 2) 1 else 2
            val switchOn = step == 4

            when (page) {
                0 -> drawAccessibilityMain(canvas, w, h)
                1 -> drawDownloadedApps(canvas, w, h)
                2 -> drawAppDetail(canvas, w, h, switchOn)
            }

            // 手指点击 (step 1,2,3)
            if (step in 1..3) drawFinger(canvas, w, h)

            canvas.restore()

            // 底部导航条
            p.color = 0xFF111827.toInt(); p.style = Paint.Style.FILL
            val barW = 60 * d
            r.set((w - barW) / 2, h - 8 * d, (w + barW) / 2, h - 5 * d)
            canvas.drawRoundRect(r, 2 * d, 2 * d, p)
        }

        /** 画 V 形箭头 */
        private fun drawChevron(canvas: Canvas, cx: Float, cy: Float, sz: Float) {
            p.color = 0xFFC4C4C4.toInt()
            p.style = Paint.Style.STROKE
            p.strokeWidth = 1.5f * d
            p.strokeCap = Paint.Cap.ROUND
            p.strokeJoin = Paint.Join.ROUND

            val half = sz / 2f
            val dx = half * 0.65f   // 横向比例，稳定不变形

            val path = Path()
            path.moveTo(cx - dx, cy - half)
            path.lineTo(cx + dx, cy)
            path.lineTo(cx - dx, cy + half)

            canvas.drawPath(path, p)

            p.style = Paint.Style.FILL
            p.strokeCap = Paint.Cap.BUTT
        }

        /** 画返回箭头 ‹ */
        private fun drawBackArrow(canvas: Canvas, cx: Float, cy: Float) {
            p.color = 0xFF111827.toInt(); p.style = Paint.Style.STROKE; p.strokeWidth = 1.5f * d
            p.strokeCap = Paint.Cap.ROUND; p.strokeJoin = Paint.Join.ROUND
            canvas.drawLine(cx + 4 * d, cy - 6 * d, cx - 2 * d, cy, p)
            canvas.drawLine(cx - 2 * d, cy, cx + 4 * d, cy + 6 * d, p)
            p.style = Paint.Style.FILL; p.strokeCap = Paint.Cap.BUTT
        }

        /** 画 MIUI 风格 Toggle */
        private fun drawToggle(canvas: Canvas, x: Float, y: Float, on: Boolean) {
            val tw = 26 * d;
            val th = 16 * d
            p.color = if (on) 0xFF3B82F6.toInt() else 0xFFE5E5E5.toInt()
            r.set(x, y, x + tw, y + th)
            canvas.drawRoundRect(r, th / 2, th / 2, p)
            p.color = Color.WHITE
            val knobR = (th - 4 * d) / 2
            val knobCx = if (on) x + tw - 2 * d - knobR else x + 2 * d + knobR
            canvas.drawCircle(knobCx, y + th / 2, knobR, p)
        }

        // ── 第一页: 无障碍主页 ──
        private fun drawAccessibilityMain(canvas: Canvas, w: Float, h: Float) {
            val padX = 14 * d

            // 大标题
            p.color = 0xFF111827.toInt(); p.textSize = 14 * d; p.textAlign = Paint.Align.LEFT
            p.setTypeface(Typeface.DEFAULT_BOLD)
            canvas.drawText("无障碍", padX, 24 * d, p)
            p.setTypeface(Typeface.DEFAULT)

            // Tab 栏
            val tabs = arrayOf("通用", "视觉", "听觉", "肢体")
            var tx = 10 * d
            tabs.forEachIndexed { i, t ->
                if (i == 0) {
                    p.color = 0xFFF3F4F6.toInt()
                    r.set(tx, 32 * d, tx + 34 * d, 46 * d)
                    canvas.drawRoundRect(r, 13 * d, 13 * d, p)
                }
                p.color = if (i == 0) 0xFF111827.toInt() else 0xFF9CA3AF.toInt()
                p.textSize = 8 * d; p.textAlign = Paint.Align.CENTER
                canvas.drawText(t, tx + 17 * d, 42 * d, p)
                tx += 40 * d
            }

            // ── 列表项 ──
            var iy = 54 * d

            // 项1: "无障碍"按钮
            p.color = 0xFF111827.toInt(); p.textSize = 9 * d; p.textAlign = Paint.Align.LEFT
            p.setTypeface(Typeface.DEFAULT_BOLD)
            canvas.drawText("\"无障碍\"按钮", padX, iy + 12 * d, p)
            p.setTypeface(Typeface.DEFAULT)
            p.color = 0xFF9CA3AF.toInt(); p.textSize = 7.5f * d
            canvas.drawText("快速使用无障碍功能", padX, iy + 22 * d, p)
            drawChevron(canvas, w - 16 * d, iy + 14 * d, 10 * d)
            iy += 30 * d

            // 分隔线
            p.color = 0xFFF3F4F6.toInt(); canvas.drawRect(padX, iy, w - padX, iy + d, p)
            iy += d + 2 * d

            // 项2: 在锁定屏幕上使用快捷方式 + 蓝色开关(开)
            p.color = 0xFF111827.toInt(); p.textSize = 9 * d
            p.setTypeface(Typeface.DEFAULT_BOLD)
            canvas.drawText("在锁定屏幕上使用快捷方式", padX, iy + 12 * d, p)
            p.setTypeface(Typeface.DEFAULT)
            p.color = 0xFF9CA3AF.toInt(); p.textSize = 6.5f * d
            canvas.drawText("允许在锁定屏幕时开启功能快捷方式。", padX, iy + 23 * d, p)
            drawToggle(canvas, w - padX - 26 * d, iy + 4 * d, true)
            iy += 32 * d

            // 分隔线
            p.color = 0xFFF3F4F6.toInt(); canvas.drawRect(padX, iy, w - padX, iy + d, p)
            iy += d + 2 * d

            // 项3: 无障碍功能菜单
            p.color = 0xFF111827.toInt(); p.textSize = 9 * d
            p.setTypeface(Typeface.DEFAULT_BOLD)
            canvas.drawText("无障碍功能菜单", padX, iy + 12 * d, p)
            p.setTypeface(Typeface.DEFAULT)
            p.color = 0xFF9CA3AF.toInt(); p.textSize = 7.5f * d
            canvas.drawText("已关闭 / 通过大型菜单控制手机", padX, iy + 22 * d, p)
            drawChevron(canvas, w - 16 * d, iy + 14 * d, 10 * d)
            iy += 30 * d

            // 分隔线
            p.color = 0xFFF3F4F6.toInt(); canvas.drawRect(padX, iy, w - padX, iy + d, p)
            iy += d + 2 * d

            // 项4: 已下载的应用 (target, 可高亮)
            if (step == 1) {
                p.color = 0xFFF0F7FF.toInt()
                r.set(8 * d, iy - 2 * d, w - 8 * d, iy + 22 * d)
                canvas.drawRoundRect(r, 6 * d, 6 * d, p)
            }
            p.color = 0xFF111827.toInt(); p.textSize = 9 * d; p.textAlign = Paint.Align.LEFT
            p.setTypeface(Typeface.DEFAULT_BOLD)
            canvas.drawText("已下载的应用", padX, iy + 12 * d, p)
            p.setTypeface(Typeface.DEFAULT)
            drawChevron(canvas, w - 16 * d, iy + 10 * d, 10 * d)
        }

        // ── 第二页: 已下载的应用列表 ──
        private fun drawDownloadedApps(canvas: Canvas, w: Float, h: Float) {
            val padX = 14 * d

            // 返回箭头
            drawBackArrow(canvas, 14 * d, 14 * d)

            // 大标题
            p.color = 0xFF111827.toInt(); p.textSize = 14 * d; p.textAlign = Paint.Align.LEFT
            p.setTypeface(Typeface.DEFAULT_BOLD)
            canvas.drawText("已下载的应用", padX, 42 * d, p)
            p.setTypeface(Typeface.DEFAULT)

            // 应用列表
            data class AppRow(
                val name: String,
                val provider: String,
                val status: String,
                val isBold: Boolean = false
            )

            val apps = listOf(
                AppRow("OpenGUI-新版", "由OpenGUI新版提供", "已开启"),
                AppRow("OpenGUI自动化服务", "由OpenGUI提供", "已关闭", true),
                AppRow("搜狗输入法小米版", "由搜狗输入法小米版提供", "已关闭"),
                AppRow("百度输入法小米版", "由百度输入法小米版提供", "已关闭")
            )

            var iy = 54 * d
            apps.forEachIndexed { i, app ->
                // 高亮OpenGUI
                if (i == 1 && step == 2) {
                    p.color = 0xFFF0F7FF.toInt()
                    r.set(8 * d, iy - 2 * d, w - 8 * d, iy + 26 * d)
                    canvas.drawRoundRect(r, 6 * d, 6 * d, p)
                }
                // 名称
                p.color = 0xFF111827.toInt(); p.textSize = 9 * d; p.textAlign = Paint.Align.LEFT
                p.setTypeface(if (app.isBold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT)
                canvas.drawText(app.name, padX, iy + 11 * d, p)
                p.setTypeface(Typeface.DEFAULT)
                // 提供者
                p.color = 0xFF9CA3AF.toInt(); p.textSize = 7 * d
                canvas.drawText(app.provider, padX, iy + 22 * d, p)
                // 右侧状态 + 箭头
                p.color = 0xFF9CA3AF.toInt(); p.textSize = 7.5f * d; p.textAlign = Paint.Align.RIGHT
                canvas.drawText(app.status, w - 24 * d, iy + 14 * d, p)
                drawChevron(canvas, w - 14 * d, iy + 12 * d, 9 * d)
                iy += 32 * d
            }
        }

        // ── 第三页: 详情页 ──
        private fun drawAppDetail(canvas: Canvas, w: Float, h: Float, switchOn: Boolean) {
            val padX = 14 * d

            // 返回箭头
            drawBackArrow(canvas, 14 * d, 14 * d)

            // 标题 (两行)
            p.color = 0xFF111827.toInt(); p.textSize = 12 * d; p.textAlign = Paint.Align.LEFT
            p.setTypeface(Typeface.DEFAULT_BOLD)
            canvas.drawText("OpenGUI自动化服务", padX, 38 * d, p)
            canvas.drawText("【必须开启】", padX, 52 * d, p)
            p.setTypeface(Typeface.DEFAULT)

            // 主开关行
            val switchRowY = 60 * d
            p.color = 0xFF111827.toInt(); p.textSize = 9 * d; p.textAlign = Paint.Align.LEFT
            canvas.drawText("使用\"OpenGUI自动化服务【必须开...\"", padX, switchRowY + 12 * d, p)

            // 开关
            drawToggle(canvas, w - padX - 28 * d, switchRowY + 2 * d, switchOn)

            // 已开启提示
            if (switchOn) {
                p.color = 0xFF22C55E.toInt(); p.textSize = 7.5f * d; p.textAlign = Paint.Align.LEFT
                // checkmark
                p.style = Paint.Style.STROKE; p.strokeWidth = 1.5f * d; p.strokeCap =
                    Paint.Cap.ROUND
                canvas.drawLine(padX, switchRowY + 26 * d, padX + 3 * d, switchRowY + 29 * d, p)
                canvas.drawLine(
                    padX + 3 * d,
                    switchRowY + 29 * d,
                    padX + 8 * d,
                    switchRowY + 24 * d,
                    p
                )
                p.style = Paint.Style.FILL; p.strokeCap = Paint.Cap.BUTT
                canvas.drawText("已开启", padX + 11 * d, switchRowY + 29 * d, p)
            }

            // 分隔线
            val divY1 = switchRowY + 36 * d
            p.color = 0xFFF3F4F6.toInt()
            canvas.drawRect(padX, divY1, w - padX, divY1 + d, p)

            // 选项区域
            val optY = divY1 + 6 * d
            p.color = 0xFF3B82F6.toInt(); p.textSize = 7.5f * d; p.textAlign = Paint.Align.LEFT
            canvas.drawText("选项", padX, optY + 10 * d, p)
            p.color = 0xFF111827.toInt(); p.textSize = 8.5f * d
            canvas.drawText("\"OpenGUI自动化服务\"快捷方式", padX, optY + 24 * d, p)
            p.color = 0xFF9CA3AF.toInt(); p.textSize = 7 * d
            canvas.drawText("关闭", padX, optY + 34 * d, p)
            // 关闭状态的开关
            drawToggle(canvas, w - padX - 28 * d, optY + 16 * d, false)

            // 分隔线
            val divY2 = optY + 42 * d
            p.color = 0xFFF3F4F6.toInt()
            canvas.drawRect(padX, divY2, w - padX, divY2 + d, p)

            // 简介区域
            val introY = divY2 + 6 * d
            p.color = 0xFF3B82F6.toInt(); p.textSize = 7.5f * d; p.textAlign = Paint.Align.LEFT
            canvas.drawText("OpenGUI自动化服务简介", padX, introY + 10 * d, p)
            p.color = 0xFF666666.toInt(); p.textSize = 7.5f * d
            canvas.drawText("启用此服务以进行自动化手势", padX, introY + 24 * d, p)
            canvas.drawText("和屏幕操作。", padX, introY + 36 * d, p)
        }

        // 手指点击 — 使用实际的手型 SVG 图标 + 波纹 (对齐 Web)
        // Web: <svg width="28" height="28" viewBox="0 0 24 24" fill="#3B82F6"> + 波纹 bg-[#3B82F6]/30
        private var handDrawable: Drawable? = null

        private fun drawFinger(canvas: Canvas, w: Float, h: Float) {
            // 对齐 Web 坐标: step1→top:268/right:15, step2→top:95/right:15, step3→top:72/right:20
            // Web phone 是 200x320; 我们的 View 也是 200dp x 280dp
            val fx: Float; val fy: Float
            when (step) {
                1 -> { fx = w - 15 * d; fy = 200 * d }    // 已下载的应用 (右下方)
                2 -> { fx = w - 15 * d; fy = 95 * d }     // OpenGUI (右侧中间)
                3 -> { fx = w - 20 * d; fy = 68 * d }     // 开关 (偏右上)
                else -> return
            }

            // 波纹动画圈 (bg-[#3B82F6]/30, animate scale 1→1.5→1)
            p.color = 0x4D3B82F6.toInt(); p.style = Paint.Style.FILL
            canvas.drawCircle(fx, fy, 18 * d, p)
            p.color = 0x303B82F6.toInt()
            canvas.drawCircle(fx, fy, 22 * d, p)

            // 手型 icon (28x28dp, 从 drawable 加载)
            if (handDrawable == null) {
                handDrawable = ContextCompat.getDrawable(context, R.drawable.ic_hand_touch)
            }
            handDrawable?.let { dr ->
                val iconSz = (22 * d).toInt()
                val left = (fx - iconSz / 2).toInt()
                val top = (fy - iconSz / 2).toInt()
                dr.setBounds(left, top, left + iconSz, top + iconSz)
                dr.draw(canvas)
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  OverlayDemoView — 悬浮窗权限演示 (对齐 Web PermissionDemo overlay)
    //  深色 App 背景 + 状态栏刘海 + App内容占位 + 白色浮窗卡片 (带阴影)
    //  卡片: 状态圆点 + 标题 + 进度条 + 描述 + 动画
    // ═══════════════════════════════════════════════════════════════

    private inner class OverlayDemoView(ctx: Context) : View(ctx) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        private val r = RectF()
        private val d = resources.displayMetrics.density
        private var step = 0
        private val clipPath = Path()

        fun startAnimation(h: Handler) {
            step = 0; invalidate()
            val tick = object : Runnable {
                override fun run() {
                    if (_binding == null) return
                    step = (step + 1) % 5; invalidate()
                    h.postDelayed(this, 2000)
                }
            }
            h.postDelayed(tick, 2000)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val w = width.toFloat(); val h = height.toFloat()
            val cornerR = 16 * d

            // ── 1. 画深色渐变背景圆角矩形 ──
//            val grad = LinearGradient(0f, 0f, 0f, h,
//                0xFF1A1A2E.toInt(), 0xFF16213E.toInt(), Shader.TileMode.CLAMP)
//            p.shader = grad;
            p.color = 0xFF1A1A2E.toInt()
            p.style = Paint.Style.FILL
            r.set(0f, 0f, w, h)
            canvas.drawRoundRect(r, cornerR, cornerR, p)
            p.shader = null

            // ── 2. 用 clipPath 做圆角裁剪 (对齐 Web overflow-hidden + rounded-[20px]) ──
            canvas.save()
            clipPath.reset()
            clipPath.addRoundRect(r, cornerR, cornerR, Path.Direction.CW)
            canvas.clipPath(clipPath)

            // ── 3. 状态栏 h-6 bg-black/30 ──
            // Web: h-6 = 1.5rem = 24px
            val statusH = 24 * d
            p.color = 0x4D000000.toInt(); p.style = Paint.Style.FILL
            canvas.drawRect(0f, 0f, w, statusH, p)
            // Dynamic Island 刘海 (w-14 h-3 bg-black rounded-full)
            p.color = 0xFF000000.toInt()
            val diW = 56 * d; val diH = 12 * d // w-14=3.5rem=56px, h-3=0.75rem=12px
            r.set((w - diW) / 2, (statusH - diH) / 2, (w + diW) / 2, (statusH + diH) / 2)
            canvas.drawRoundRect(r, diH / 2, diH / 2, p)

            // ── 4. 模拟APP界面 p-3 space-y-2 ──
            // Web: p-3 = 12px, space-y-2 = 8px
            val pad = 12 * d; val gap = 8 * d
            var by = statusH + pad

            // 搜索栏: h-7 bg-white/10 rounded-lg (h-7 = 1.75rem = 28px)
            p.color = 0x1AFFFFFF.toInt()
            r.set(pad, by, w - pad, by + 28 * d)
            canvas.drawRoundRect(r, 6 * d, 6 * d, p)
            by += 28 * d + gap

            // 内容卡片 x4: h-10 bg-white/10 rounded-xl (h-10 = 2.5rem = 40px)
            for (i in 0..3) {
                r.set(pad, by, w - pad, by + 40 * d)
                canvas.drawRoundRect(r, 10 * d, 10 * d, p)
                by += 40 * d + gap
            }

            // ── 5. 悬浮窗卡片 (absolute top-14 right-3, w-[130px]) ──
            // top-14 = 3.5rem = 56px, right-3 = 0.75rem = 12px, w-[130px]
            val cardW = 130 * d; val cardH = 72 * d
            val cardScale = if (step >= 2) 1.02f else 1f
            val cardOffY = if (step >= 2) 5 * d else 0f
            val cx = w - cardW - 12 * d
            val cy = 56 * d + cardOffY

            canvas.save()
            canvas.scale(cardScale, cardScale, cx + cardW / 2, cy + cardH / 2)

            // 卡片阴影 (shadow-2xl)
            setLayerType(LAYER_TYPE_SOFTWARE, null)
            p.color = Color.WHITE; p.style = Paint.Style.FILL
            p.setShadowLayer(14 * d, 0f, 6 * d, 0x40000000.toInt())
            r.set(cx, cy, cx + cardW, cy + cardH)
            canvas.drawRoundRect(r, 12 * d, 12 * d, p)
            p.clearShadowLayer()

            // p-3 = 12px 卡片内填充
            val cPad = 12 * d

            // 状态行: 圆点 + 文字 (flex items-center gap-2 mb-2)
            val dotColor = if (step < 2) 0xFF2E58FF.toInt() else 0xFF22C55E.toInt()
            p.color = dotColor; p.style = Paint.Style.FILL
            // w-2 h-2 = 8px dot
            canvas.drawCircle(cx + cPad + 4 * d, cy + cPad + 5 * d, 3.5f * d, p)
            // text-[10px] font-semibold
            p.color = 0xFF111827.toInt(); p.textSize = 8 * d; p.textAlign = Paint.Align.LEFT
            p.setTypeface(Typeface.DEFAULT_BOLD)
            canvas.drawText(
                if (step < 2) "正在执行..." else "任务完成！",
                cx + cPad + 12 * d, cy + cPad + 9 * d, p)
            p.setTypeface(Typeface.DEFAULT)

            // 进度条 (h-1.5 bg-[#E5E7EB] rounded-full, mb-2)
            val barX = cx + cPad; val barY = cy + cPad + 18 * d
            val barW = cardW - 2 * cPad; val barH = 5 * d
            p.color = 0xFFE5E7EB.toInt()
            r.set(barX, barY, barX + barW, barY + barH)
            canvas.drawRoundRect(r, barH / 2, barH / 2, p)
            // 填充 (bg-[#2E58FF])
            p.color = 0xFF2E58FF.toInt()
            val progress = minOf(1f, (step + 1) * 0.25f)
            r.set(barX, barY, barX + barW * progress, barY + barH)
            canvas.drawRoundRect(r, barH / 2, barH / 2, p)

            // 描述文字 (text-[9px] text-[#6B7280])
            p.color = 0xFF6B7280.toInt(); p.textSize = 7 * d; p.textAlign = Paint.Align.LEFT
            val desc = when (step) {
                0 -> "打开微信..."
                1 -> "发送消息..."
                2 -> "已完成发送"
                else -> "✓ 任务成功"
            }
            canvas.drawText(desc, cx + cPad, barY + barH + 14 * d, p)

            canvas.restore() // cardScale
            canvas.restore() // clipPath

            // ── 6. 底部导航条 (w-[80px] h-1 bg-white/30 rounded-full) ──
            p.color = 0x4DFFFFFF.toInt(); p.style = Paint.Style.FILL
            val bW = 60 * d
            r.set((w - bW) / 2, h - 8 * d, (w + bW) / 2, h - 5 * d)
            canvas.drawRoundRect(r, 2 * d, 2 * d, p)
        }
    }
}
