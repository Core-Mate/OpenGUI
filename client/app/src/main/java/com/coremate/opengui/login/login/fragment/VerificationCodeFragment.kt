package com.coremate.opengui.login.login.fragment

import android.animation.ObjectAnimator
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.OnBackPressedCallback
import androidx.fragment.app.Fragment
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.login.login.Controller
import com.coremate.opengui.login.login.IntroGuideActivity
import com.coremate.opengui.R
import com.coremate.opengui.common.utils.KeyboardUtil
import com.coremate.opengui.databinding.FragmentVerificationCodeBinding
import com.coremate.opengui.feature.promotor.ui.home.HomeActivity
import com.coremate.opengui.network.api.login.VerifyCodeResp
import com.tencent.mmkv.MMKV

class VerificationCodeFragment : Fragment() {
    private var _binding: FragmentVerificationCodeBinding? = null
    private val binding get() = _binding!!
    private var onBackListener: (() -> Unit)? = null
    private var presenter: Controller? = null
    private var countDownHandler: Handler? = null
    private var countDownRunnable: Runnable? = null
    private var countDownTime = 60
    private var phone: String = ""
    private var aff: String = ""

    fun setBackListener(listener: () -> Unit) {
        onBackListener = listener
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentVerificationCodeBinding.inflate(inflater, container, false)
        presenter = Controller(requireContext())
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.vStatus.layoutParams.height = AMScreenUtils.getStatusBarHeight()
        binding.inputCodeLayout.setOnInputCompleteListener {
            KeyboardUtil.closeKeyboard(binding.inputCodeLayout.edtCode)
            presenter?.verifyCode(phone, it, aff, this@VerificationCodeFragment)
        }

        val inputCodeLayoutW =
            (AMScreenUtils.screenWidth() - AMScreenUtils.dp2px(48f) - AMScreenUtils.dp2px(50f)) / 6
        binding.inputCodeLayout.width = inputCodeLayoutW
        binding.inputCodeLayout.height = (inputCodeLayoutW * 1.14f).toInt()
        binding.btnClose.setOnClickListener {
            binding.inputCodeLayout.clear()
            onBackListener?.invoke()
        }
        binding.btRequestCode.setOnClickListener {
            setPhoneNumber(phone, aff)
        }
        val callback = object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
            }
        }
        requireActivity().onBackPressedDispatcher.addCallback(this, callback)

        countDownHandler = Handler(Looper.getMainLooper())
    }

    override fun onResume() {
        super.onResume()

        binding.inputCodeLayout.edtCode.post {
            binding.inputCodeLayout.edtCode.requestFocus()
            KeyboardUtil.openKeyboard(requireContext(), binding.inputCodeLayout.edtCode)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()

        stopCountDown()
        countDownHandler = null
        _binding = null
    }

    fun setPhoneNumber(phone: String, aff: String) {
        this.phone = phone
        this.aff = aff
        activity?.runOnUiThread {
            binding.title.text = "We sent a code to $phone"

            startCountDown()
        }
    }

    fun loginResult(result: VerifyCodeResp?) {
        activity?.runOnUiThread {
            if (result == null) {
                binding.title.text = "SMS verification failed"
                binding.title.setTextColor(Color.parseColor("#EF5350"))

                playShakeAndClear()
            } else {
                val mmkv = MMKV.defaultMMKV()
                mmkv.encode("token", result.token)
                mmkv.encode("id", result.user.id)
                mmkv.encode("name", result.user.name)
                mmkv.encode("phone", result.user.phoneNumber)
                mmkv.encode("email", result.user.email)
                mmkv.encode("image", result.user.image)
                mmkv.encode("role", result.user.role)
                mmkv.encode("tenantId", result.user.tenantId)
                mmkv.encode("lastLoginTime", System.currentTimeMillis())
                mmkv.encode("lastLoginVersion", getAppVersionCode(requireContext()))


                val intent = if (result.finishOnboarding) {
                    Intent(context, HomeActivity::class.java)
                } else {

                    Intent(context, IntroGuideActivity::class.java)
                }
                startActivity(intent)
                activity?.finish()
            }
        }
    }

    private fun startCountDown() {

        stopCountDown()


        countDownTime = 60


        binding.btRequestCode.isEnabled = false
        binding.btRequestCode.isClickable = false
        binding.btRequestCode.setTextColor(Color.parseColor("#9CA3AF"))


        countDownRunnable = object : Runnable {
            override fun run() {
                if (countDownTime > 0) {
                    binding.btRequestCode.text = "Resend (${countDownTime}s）"
                    countDownTime--
                    countDownHandler?.postDelayed(this, 1000)
                } else {

                    binding.btRequestCode.text = "Resend"
                    binding.btRequestCode.setBackgroundResource(R.drawable.login_v_bt_background)
                    binding.btRequestCode.setTextColor(Color.parseColor("#000000"))
                    binding.btRequestCode.isEnabled = true
                    binding.btRequestCode.isClickable = true
                    countDownRunnable = null
                }
            }
        }


        countDownHandler?.post(countDownRunnable!!)
    }

    private fun stopCountDown() {
        countDownRunnable?.let {
            countDownHandler?.removeCallbacks(it)
            countDownRunnable = null
        }
    }

    /**
     */
    private fun playShakeAndClear() {
        binding.inputCodeLayout.setErrorState(true)
        val shakePx = AMScreenUtils.dp2px(10f).toFloat()
        val animator = ObjectAnimator.ofFloat(
            binding.inputCodeLayout,
            View.TRANSLATION_X,
            0f, -shakePx, shakePx, -shakePx, shakePx, 0f
        )
        animator.duration = 500
        animator.start()
        binding.inputCodeLayout.postDelayed({
            _binding?.inputCodeLayout?.clear()
        }, 800)
    }

    private fun getAppVersionCode(context: Context): Long {
        try {
            val packageInfo: PackageInfo =
                context.packageManager.getPackageInfo(context.packageName, 0)

            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode.toLong()
            }
        } catch (e: PackageManager.NameNotFoundException) {
            e.printStackTrace()
        }
        return -1
    }
}
