package com.coremate.opengui.login.login

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.coremate.opengui.R
import com.coremate.opengui.login.login.fragment.LoginPageFragment

/**
 */
class IntroGuideActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_intro_guide)

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.fragment_container, LoginPageFragment())
                .commit()
        }


        supportFragmentManager.executePendingTransactions()
        val fragment = supportFragmentManager.findFragmentById(R.id.fragment_container)
        if (fragment is LoginPageFragment) {
            fragment.setOnNextPageListener {
                startActivity(Intent(this, UserGuideActivity::class.java))
                finish()
            }
        }
    }
}
