package com.coremate.opengui.feature.promotor.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.DialogInterface
import android.os.Build
import android.os.Bundle
import android.widget.SeekBar
import android.widget.Toast
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.coremate.opengui.common.push.PushManager
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.ActivityDebugBinding
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.api.ai_role.DefaultModel
import com.tencent.mmkv.MMKV
import kotlinx.coroutines.launch

class DebugActivity : AppCompatActivity() {

    private var _binding: ActivityDebugBinding? = null
    private val binding get() = _binding!!

    @RequiresApi(Build.VERSION_CODES.O)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        _binding = ActivityDebugBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val mmkv = MMKV.defaultMMKV()
        val server = mmkv.decodeString("Server", "China")
        if (server == "China") {
            binding.china.isChecked = true
        } else if (server == "Hongkong") {
            binding.hongkong.isChecked = true
        } else if (server == "Test") {
            binding.test.isChecked = true
        }

        val qualityValue = mmkv.decodeInt("Quality")
        val quality = if (qualityValue <= 0) {
            80
        } else {
            qualityValue
        }
        binding.sbDebug.progress = quality
        binding.tvQuality.text = "图片压缩质量：$quality"

        binding.tvUploadLog.text = mmkv.decodeString("LastLogUrl", "最近没有上传日志")

        binding.rgServerSwitch.setOnCheckedChangeListener { radioGroup, i ->
            when (i) {
                R.id.china -> {
                    MMKV.defaultMMKV().encode("Server", "China")
                }

                R.id.hongkong -> {
                    MMKV.defaultMMKV().encode("Server", "Hongkong")
                }

                R.id.test -> {
                    MMKV.defaultMMKV().encode("Server", "Test")
                }
            }
            val alertDialog =
                AlertDialog.Builder(this).setMessage("切换服务器需要退出重新登录")
                    .setPositiveButton("确定", object : DialogInterface.OnClickListener {
                        override fun onClick(dialog: DialogInterface?, which: Int) {
                            dialog?.dismiss()
                            val mmkv = MMKV.defaultMMKV()
                            mmkv.encode("token", "")
                            mmkv.encode("LastLoginTime", -1)
                            mmkv.encode("VersionCode", -1)
                            mmkv.encode("Phone", "")
                            finishAffinity()
                        }
                    }).create()
            alertDialog.setCanceledOnTouchOutside(false)
            alertDialog.setCancelable(false)
            alertDialog.show()
        }

        binding.rgModelSwitch.setOnCheckedChangeListener { radioGroup, i ->
            var model: String? = null
            when (i) {
                R.id.rb_uitars -> {
                    model = "mate-r1"
                }

                R.id.rb_mobilev3 -> {
                    model = "mate-v3"
                }

                else -> {
                }
            }
            lifecycleScope.launch {
                val apiService: ApiService = RetrofitClient.create(this@DebugActivity)
                runCatching {
                    apiService.setDefaultModel(DefaultModel(model!!))
                }.onSuccess {
                    LogManager.saveLog(
                        this@DebugActivity,
                        "MeFragment",
                        "MeFragment | initListener | $model 模型设置成功",
                        TaskCenter.executionId?:-1
                    )
                    if (model == "mate-r1") {
                        binding.rbUitars.isChecked = true
                    } else if (model == "mate-v3") {
                        binding.rbMobilev3.isChecked = true
                    }
                    MMKV.defaultMMKV().encode("DefaultModel", model)
                }.onFailure {
                    it.printStackTrace()
                    LogManager.saveLog(
                        this@DebugActivity,
                        "MeFragment",
                        "MeFragment | initListener | $model 模型设置失败  | ${it.message}",
                        TaskCenter.executionId?:-1
                    )
                    Toast.makeText(this@DebugActivity, "模型设置出错", Toast.LENGTH_SHORT).show()
                }
            }
        }

        binding.tvUploadLog.setOnClickListener {
            val clipboard =
                getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Log", binding.tvUploadLog.text ?: "-1")
            clipboard.setPrimaryClip(clip)
            Toast.makeText(this, "Log 连接已复制", Toast.LENGTH_SHORT).show()
        }


        val defaultModel = mmkv.decodeString("DefaultModel", "mate-r1")
        if (defaultModel == "mate-r1") {
            binding.rbUitars.isChecked = true
        } else if (defaultModel == "mate-v3") {
            binding.rbMobilev3.isChecked = true
        }

        binding.tvPushDeviceToken.setText(PushManager.instance.mDeviceToken ?: "-1")
        binding.tvPushDeviceToken.setOnClickListener {
            val clipboard =
                getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            val clip =
                ClipData.newPlainText("PushDeviceToken", PushManager.instance.mDeviceToken ?: "-1")
            clipboard.setPrimaryClip(clip)
            Toast.makeText(this, "Push Token 已复制", Toast.LENGTH_SHORT).show()
        }

        binding.tvUserToken.setText(mmkv.decodeString("token"))
        binding.tvUserToken.setOnClickListener {
            val clipboard =
                getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("UserToken", mmkv.decodeString("token"))
            clipboard.setPrimaryClip(clip)
            Toast.makeText(this, "User Token 已复制", Toast.LENGTH_SHORT).show()
        }

        binding.sbDebug.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                binding.tvQuality.text = "图片压缩质量：$progress"
            }

            override fun onStartTrackingTouch(seekBar: SeekBar?) {
                // no-op
            }

            override fun onStopTrackingTouch(seekBar: SeekBar?) {
                val value = seekBar?.progress ?: 0
                MMKV.defaultMMKV().encode("Quality", value)
            }
        })

    }
}