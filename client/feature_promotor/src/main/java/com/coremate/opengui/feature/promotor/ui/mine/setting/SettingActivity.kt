package com.coremate.opengui.feature.promotor.ui.mine.setting

import android.content.pm.PackageManager
import android.os.Build
import android.widget.Toast
import com.coremate.opengui.feature.promotor.databinding.ActivitySettingBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.network.api.ServerConstant
import com.tencent.mmkv.MMKV

class SettingActivity :
    BaseBindingActivity<ActivitySettingBinding>(ActivitySettingBinding::inflate) {

    private lateinit var urlMMKV: MMKV

    override fun initParam() {
        urlMMKV = MMKV.mmkvWithID("BaseUrl")
    }

    override fun initView() {
        // 显示当前服务器地址
        val currentUrl = urlMMKV.decodeString("BaseUrl", null) ?: ServerConstant.BASE_URL_DEBUG
        binding.etServerUrl.setText(currentUrl)

        // 版本号
        binding.tvVersion.text = "version: ${getVersionName()}"
    }

    override fun initEvent() {
        binding.btnBack.setOnClickListener { finish() }

        binding.btnSave.setOnClickListener {
            val url = binding.etServerUrl.text.toString().trim()
            if (url.isEmpty()) {
                Toast.makeText(this, "请输入服务器地址", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                Toast.makeText(this, "地址需要以 http:// 或 https:// 开头", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            urlMMKV.encode("BaseUrl", url)
            Toast.makeText(this, "已保存，重启应用生效", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    private fun getVersionName(): String {
        return try {
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
            } else {
                packageManager.getPackageInfo(packageName, 0)
            }
            packageInfo.versionName ?: "unknown"
        } catch (e: Exception) {
            "unknown"
        }
    }
}
