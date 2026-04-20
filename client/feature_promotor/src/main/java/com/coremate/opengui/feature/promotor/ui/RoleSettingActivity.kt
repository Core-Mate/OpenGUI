package com.coremate.opengui.feature.promotor.ui

import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.ActivityRoleSettingBinding

class RoleSettingActivity : AppCompatActivity() {

    private var _binding: ActivityRoleSettingBinding? = null
    private val binding get() = _binding!!

    @RequiresApi(Build.VERSION_CODES.O)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        _binding = ActivityRoleSettingBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .add(R.id.root, RoleSettingFragment(),"rolesetting")
                .commit()
        }
    }

    override fun onBackPressed() {
        super.onBackPressed()
        finish()
    }
}