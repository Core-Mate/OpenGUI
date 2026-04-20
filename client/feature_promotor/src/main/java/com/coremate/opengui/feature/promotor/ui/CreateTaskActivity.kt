package com.coremate.opengui.feature.promotor.ui

import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.ActivityCreateTaskBinding

@RequiresApi(Build.VERSION_CODES.O)
class CreateTaskActivity : AppCompatActivity() {

    private var _binding: ActivityCreateTaskBinding? = null
    private val binding get() = _binding!!

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        _binding = ActivityCreateTaskBinding.inflate(layoutInflater)
        setContentView(binding.root)

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .add(R.id.root, AddMissionSchedulesFragment(),"first")
                .commit()
        }
    }
}