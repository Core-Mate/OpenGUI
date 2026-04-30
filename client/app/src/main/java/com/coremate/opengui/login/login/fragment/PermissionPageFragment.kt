package com.coremate.opengui.login.login.fragment

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.core.content.ContextCompat
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.accessibility.GestureService
import com.coremate.opengui.databinding.FragmentPermissionPageBinding
import com.coremate.opengui.feature.promotor.R

class PermissionPageFragment : Fragment() {
    private var _binding: FragmentPermissionPageBinding? = null
    private val binding get() = _binding!!


    private var accessibilityEnabled = false
    private var overlayEnabled = false
    private var checking = false
    private var showSkipToast = false
    private var skipConfirmed = false


    private var onBackListener: (() -> Unit)? = null
    private var onCompleteListener: (() -> Unit)? = null
    private var onSkipListener: (() -> Unit)? = null

    fun setOnBackListener(listener: () -> Unit) {
        onBackListener = listener
    }

    fun setOnCompleteListener(listener: () -> Unit) {
        onCompleteListener = listener
    }

    fun setOnSkipListener(listener: () -> Unit) {
        onSkipListener = listener
    }


    fun setOnNextPageListener(listener: () -> Unit) {
        onCompleteListener = listener
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPermissionPageBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.vStatus.layoutParams.height = AMScreenUtils.getStatusBarHeight()

        binding.buttonBack.setOnClickListener { onBackListener?.invoke() }

        binding.buttonSkip.setOnClickListener { handleSkipPress() }
        binding.buttonSkip.text = if (skipConfirmed) "Skip Anyway" else "Maybe later"

        binding.permissionAccessibility.setOnClickListener {
            if (!accessibilityEnabled) openAccessibilitySettings()
        }
        binding.permissionOverlay.setOnClickListener {
            if (!overlayEnabled) openOverlaySettings()
        }

        binding.buttonContinue.setOnClickListener { handleBottomButtonPress() }

        checkPermissions()
        refreshUi()
    }

    override fun onResume() {
        super.onResume()
        checkPermissions()
    }

    private fun handleSkipPress() {
        if (skipConfirmed) {
            onSkipListener?.invoke() ?: onCompleteListener?.invoke()
        } else {
            showSkipToast = true
            skipConfirmed = true
            binding.buttonSkip.text = "Skip Anyway"
            binding.buttonSkip.setTextColor(
                ContextCompat.getColor(
                    requireContext(),
                    android.R.color.holo_red_dark
                )
            )
            Toast.makeText(requireContext(), "Enable the required permissions to continue.", Toast.LENGTH_LONG).show()
            Handler(Looper.getMainLooper()).postDelayed({ showSkipToast = false }, 2500)
        }
    }

    private fun checkPermissions() {
        checking = true
        refreshUi()
        Handler(Looper.getMainLooper()).postDelayed({
            accessibilityEnabled = isAccessibilityServiceEnabled(requireContext())
            overlayEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(requireContext())
            } else {
                true
            }
            checking = false
            refreshUi()
        }, 500)
    }

    private fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val service = "${context.packageName}/${GestureService::class.java.canonicalName}"
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        return enabledServices?.contains(service) == true
    }

    private fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
    }

    private fun openOverlaySettings() {
        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
            data = Uri.parse("package:${requireContext().packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
    }

    private fun refreshUi() {
        val enabledCount = listOf(accessibilityEnabled, overlayEnabled).count { it }
        val totalCount = 2
        val allEnabled = enabledCount == totalCount


        val checkRes = R.drawable.icon_check
        val arrowRes = R.drawable.icon_arrow_right
        binding.flAccessibility.setBackgroundResource(if (accessibilityEnabled) R.drawable.icon_bg_green else R.drawable.icon_bg_gray)
        binding.permissionAccessibility.setBackgroundResource(if (accessibilityEnabled) R.drawable.permission_item_active_bg else R.drawable.permission_item_bg)
        binding.checkAccessibility.setImageResource(if (accessibilityEnabled) checkRes else arrowRes)
        binding.checkAccessibility.visibility = View.VISIBLE
        binding.flOverlay.setBackgroundResource(if (overlayEnabled) R.drawable.icon_bg_green else R.drawable.icon_bg_gray)
        binding.permissionOverlay.setBackgroundResource(if (overlayEnabled) R.drawable.permission_item_active_bg else R.drawable.permission_item_bg)
        binding.checkOverlay.setImageResource(if (overlayEnabled) checkRes else arrowRes)
        binding.checkOverlay.visibility = View.VISIBLE


        binding.indicator1.setBackgroundResource(
            if (accessibilityEnabled) R.drawable.indicator_green_active
            else R.drawable.indicator_inactive
        )
        binding.indicator2.setBackgroundResource(
            if (overlayEnabled) R.drawable.indicator_green_active
            else R.drawable.indicator_inactive
        )
        binding.permissionCount.text = "$enabledCount/$totalCount Enabled"


        binding.buttonContinue.isEnabled = !checking
        binding.buttonContinue.text = when {
            checking -> "Checking..."
            allEnabled -> "Settings Complete, Continue"
            enabledCount == 0 -> "Open Settings"
            else -> "Continue Setup ($enabledCount/$totalCount)"
        }


        binding.buttonContinue.setBackgroundResource(if (allEnabled) R.drawable.rounded_green_button else R.drawable.rounded_button)
        binding.buttonSkip.visibility = if (allEnabled) View.INVISIBLE else View.VISIBLE
        binding.buttonContinue.alpha = if (checking) 0.5f else 1f
    }

    private fun handleBottomButtonPress() {
        if (checking) return
        val allEnabled = accessibilityEnabled && overlayEnabled
        when {
            allEnabled -> onCompleteListener?.invoke()
            !accessibilityEnabled -> openAccessibilitySettings()
            !overlayEnabled -> openOverlaySettings()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
