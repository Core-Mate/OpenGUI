package com.coremate.opengui.login.login

import android.widget.Toast
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.login.login.adapter.LoginPagerAdapter
import com.coremate.opengui.databinding.ActivityLoginBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.login.RequestVerificationCode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * 登录页
 * ViewPager: [PhoneNumberFragment, VerificationCodeFragment]
 */
class LoginActivity : BaseBindingActivity<ActivityLoginBinding>(ActivityLoginBinding::inflate) {
    private lateinit var pagerAdapter: LoginPagerAdapter
    private var apiService: ApiService? = null
    private val coroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val TAG = "LoginActivity"

    override fun initView() {
        setupViewPager()
    }

    override fun initEvent() {
    }

    override fun initParam() {
        apiService = RetrofitClient.create(this@LoginActivity)
    }

    private fun setupViewPager() {
        pagerAdapter = LoginPagerAdapter(this)
        binding.viewPager.adapter = pagerAdapter
        binding.viewPager.isUserInputEnabled = false
        binding.viewPager.offscreenPageLimit = pagerAdapter.itemCount

        setupListeners()
    }

    private fun setupListeners() {
        // 手机号页面监听
        pagerAdapter.getPhoneNumberPageFragment()
            .setRequestCodeListener { phoneNumber, aff ->
                requestCode(phoneNumber, aff)
            }

        // 验证码页面返回监听
        pagerAdapter.getVerificationCodeFragment().setBackListener {
            binding.viewPager.currentItem = 0
        }
    }

    fun requestCode(phoneNumber: String, aff: String) {
        coroutineScope.launch(Dispatchers.IO) {
            runCatching {
                apiService?.requestVerificationCode(RequestVerificationCode(phoneNumber))
            }.onSuccess {
                if (it?.code() == 200) {
                    launch(Dispatchers.Main) {
                        binding.viewPager.currentItem = 1
                        pagerAdapter.getVerificationCodeFragment()
                            .setPhoneNumber(phoneNumber, aff)
                    }
                } else {
                    launch(Dispatchers.Main) {
                        when (it?.code()) {
                            429 -> {
                                Toast.makeText(
                                    this@LoginActivity,
                                    "请求过于频繁，请稍后再试",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }

                            else -> {
                                Toast.makeText(
                                    this@LoginActivity,
                                    "出错了，请稍后重试",
                                    Toast.LENGTH_SHORT
                                ).show()
                                LogManager.saveLog(
                                    this@LoginActivity,
                                    TAG,
                                    "$TAG | 错误 | requestCode | phone = $phoneNumber , resp = null? ${it == null}, code = ${it?.code()}, message = ${it?.message()}",
                                    TaskCenter.executionId ?: -1
                                )
                            }
                        }
                    }
                }

            }.onFailure {
                it.printStackTrace()
                LogManager.saveLog(
                    this@LoginActivity,
                    TAG,
                    "$TAG | 错误 | requestCode | phone = $phoneNumber , error = ${it.message}",
                    TaskCenter.executionId ?: -1
                )
            }
        }
    }
}
