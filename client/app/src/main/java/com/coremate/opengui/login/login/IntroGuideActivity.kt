package com.coremate.opengui.login.login

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.coremate.opengui.R
import com.coremate.opengui.login.login.fragment.LoginPageFragment

/**
 * 登录后引导页 — 承载 LoginPageFragment（10步产品引导 + 权限申请）
 * 完成后跳转到 UserGuideActivity（目标选择）
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

        // 每次 onCreate 都重新绑定监听（包括 process death 恢复场景）
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
