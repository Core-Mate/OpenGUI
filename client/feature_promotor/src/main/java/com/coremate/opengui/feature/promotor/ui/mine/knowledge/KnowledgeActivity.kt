package com.coremate.opengui.feature.promotor.ui.mine.knowledge

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.coremate.opengui.feature.promotor.databinding.ActivityKnowledgeBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity

class KnowledgeActivity :
    BaseBindingActivity<ActivityKnowledgeBinding>(ActivityKnowledgeBinding::inflate) {

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            openFilePicker()
        }
    }

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let {


        }
    }

    override fun initView() {
        binding.titlebar.setTitle("Knowledge Base").setLeftIconClickListener {
            finish()
        }
    }

    override fun initEvent() {
        binding.btnUpload.setOnClickListener {
            checkStoragePermissionAndOpenFilePicker()
        }
    }

    override fun initParam() {
    }

    private fun checkStoragePermissionAndOpenFilePicker() {

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            openFilePicker()
        } else {

            val permission = Manifest.permission.READ_EXTERNAL_STORAGE
            if (ContextCompat.checkSelfPermission(
                    this,
                    permission
                ) == PackageManager.PERMISSION_GRANTED
            ) {
                openFilePicker()
            } else {
                requestPermissionLauncher.launch(permission)
            }
        }
    }

    private fun openFilePicker() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "*/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }
        filePickerLauncher.launch("*/*")
    }
}