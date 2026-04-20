package com.coremate.opengui.login.login.adapter

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.viewpager2.adapter.FragmentStateAdapter
import com.coremate.opengui.login.login.fragment.PhoneNumberFragment
import com.coremate.opengui.login.login.fragment.VerificationCodeFragment

class LoginPagerAdapter(fragmentActivity: FragmentActivity) :
    FragmentStateAdapter(fragmentActivity) {

    private val fragments = listOf(
        PhoneNumberFragment(),
        VerificationCodeFragment()
    )

    override fun getItemCount(): Int = fragments.size

    override fun createFragment(position: Int): Fragment = fragments[position]

    fun getPhoneNumberPageFragment(): PhoneNumberFragment = fragments[0] as PhoneNumberFragment

    fun getVerificationCodeFragment(): VerificationCodeFragment =
        fragments[1] as VerificationCodeFragment
}
