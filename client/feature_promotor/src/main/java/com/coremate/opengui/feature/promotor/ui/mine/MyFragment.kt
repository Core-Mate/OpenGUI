package com.coremate.opengui.feature.promotor.ui.mine

import android.content.DialogInterface
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import com.coremate.opengui.feature.promotor.databinding.FragmentMyBinding
import com.coremate.opengui.feature.promotor.manager.UserManager
import com.coremate.opengui.feature.promotor.ui.mine.knowledge.KnowledgeActivity
import com.coremate.opengui.feature.promotor.ui.mine.recharge.RechargeFragment
import com.coremate.opengui.feature.promotor.ui.mine.payrecord.PayRecordActivity
import com.coremate.opengui.feature.promotor.ui.mine.preference.ExecutePreferenceActivity
import com.coremate.opengui.feature.promotor.ui.mine.setting.SettingActivity
import com.coremate.opengui.network.api.mine.MyBalanceRespItem
import com.coremate.opengui.network.api.mine.MyCheckinRespItem
import com.tencent.mmkv.MMKV

class MyFragment : Fragment() {

    private var binding: FragmentMyBinding? = null
    private var presenter: MyPresenter? = null

    // 签到状态管理
    private sealed class CheckinState {
        data class NotCheckedIn(val points: Long) : CheckinState()
        data class Loading(val points: Long) : CheckinState()  // 保存积分值以便失败时恢复
        object CheckedIn : CheckinState()
    }

    private var checkinState: CheckinState = CheckinState.NotCheckedIn(0)

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        binding = FragmentMyBinding.inflate(layoutInflater, container, false)
        presenter = MyPresenter(this)
        return binding?.root
    }

    override fun onDestroyView() {
        super.onDestroyView()
        binding = null
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val binding = binding ?: return
        binding.tvPhone.text =
            "${maskPhoneNumber(UserManager.phone ?: "xxx xxxx xxxx")}(${UserManager.id})"
        binding.tvName.text = UserManager.name

        binding.accountStatTasks.text = "28"
        binding.accountStatSaved.text = "4.2h"
        binding.accountStatRate.text = "99%"
        binding.accountPointsValue.text = "0"
        binding.accountPointsHours.text = "约可使用 0.0 小时"

        // 签到点击事件
        binding.llCheckin.setOnClickListener {
            handleCheckinClick()
        }

        binding.accountPointsRow.setOnClickListener {
            val bottomSheetDialog = RechargeFragment()
            activity?.let {
                bottomSheetDialog.show(
                    it.supportFragmentManager,
                    RechargeFragment::class.java.simpleName
                )
            }
        }

        binding.accountMenuPreference.apply {
            accountMenuLabel.text = "执行偏好"
            accountMenuRoot.setOnClickListener {
                val intent = Intent(context, ExecutePreferenceActivity::class.java)
                startActivity(intent)
            }
        }

        binding.accountMenuKnowledge.apply {
            accountMenuLabel.text = "知识库"
            accountMenuRoot.setOnClickListener {
                val intent = Intent(context, KnowledgeActivity::class.java)
                startActivity(intent)
            }
        }

        binding.accountMenuWhitelist.apply {
            accountMenuLabel.text = "应用白名单"
            accountMenuLabel.setTextColor(Color.parseColor("#94A3B8"))
            accountMenuLock.visibility = View.VISIBLE
            accountMenuArrow.visibility = View.GONE
        }

        binding.accountMenuRunMode.apply {
            accountMenuLabel.text = "运行模式"
            accountMenuValue.text = "全自动模式"
            accountMenuLabel.setTextColor(Color.parseColor("#94A3B8"))
            accountMenuLock.visibility = View.VISIBLE
            accountMenuArrow.visibility = View.GONE

//            accountMenuRoot.setOnClickListener {
//                fragmentManager?.let {
//                    SwitchModelFragment.Companion.newInstance().show(it, "SwitchModelFragment")
//                }
//            }
        }

        binding.accountMenuConsumption.apply {
            accountMenuLabel.text = "消费记录"
            accountMenuRoot.setOnClickListener {
                val intent = Intent(context, PayRecordActivity::class.java)
                startActivity(intent)
            }
        }

        binding.accountSettingsBtn.setOnClickListener {
            val intent = Intent(context, SettingActivity::class.java)
            startActivity(intent)
        }

        binding.llLogout.setOnClickListener {
            val alertDialog = AlertDialog.Builder(requireContext()).setMessage("确定退出登录?")
                .setPositiveButton("确定", object : DialogInterface.OnClickListener {
                    override fun onClick(dialog: DialogInterface?, which: Int) {
                        dialog?.dismiss()
//                        MMKV.defaultMMKV().clearAll()
                        val mmkv = MMKV.defaultMMKV()
                        mmkv.encode("token", "")
                        mmkv.encode("LastLoginTime", -1)
                        mmkv.encode("VersionCode", -1)
                        mmkv.encode("Phone", "")
                        activity?.finish()
                    }
                }).setCancelable(true).create()

            alertDialog.show()
        }
    }

    fun maskPhoneNumber(phone: String): String {
        if (phone.length != 11) return phone
        return phone.replaceRange(3, 7, "****")
    }

    override fun onResume() {
        super.onResume()
        presenter?.getMyBalance(source = "onResume")
    }

    fun updateBalance(data: MyBalanceRespItem?) {
        requireActivity().runOnUiThread {
            binding?.accountPointsValue?.text = (data?.remaining ?: 0).toString()

            // 更新签到状态
            checkinState = if (data?.isCheckin == true) {
                CheckinState.CheckedIn
            } else {
                CheckinState.NotCheckedIn(data?.checkinCredit ?: 0)
            }
            updateCheckinUI()
        }
    }

    // 签到点击处理
    private fun handleCheckinClick() {
        val currentState = checkinState
        if (currentState is CheckinState.NotCheckedIn) {
            // 保存当前积分值，以便失败时恢复
            checkinState = CheckinState.Loading(currentState.points)
            updateCheckinUI()
            presenter?.onCheckin()
        }
    }

    // 签到成功
    fun onCheckinSuc(data: MyCheckinRespItem?) {
        requireActivity().runOnUiThread {
            if (data?.isCheckin == true) {
                checkinState = CheckinState.CheckedIn
                updateCheckinUI()
                presenter?.getMyBalance(source = "checkin")
            } else {
                onCheckinErr()
            }
        }
    }

    // 签到失败
    fun onCheckinErr() {
        requireActivity().runOnUiThread {
            // 恢复到未签到状态，保留原来的积分值
            val currentState = checkinState
            if (currentState is CheckinState.Loading) {
                checkinState = CheckinState.NotCheckedIn(currentState.points)
                updateCheckinUI()
            }
        }
    }

    // 统一的签到UI更新方法
    private fun updateCheckinUI() {
        binding?.apply {
            when (val state = checkinState) {
                is CheckinState.NotCheckedIn -> {
                    // 未签到状态
                    llCheckin.visibility = View.VISIBLE
                    llHasCheckin.visibility = View.GONE
                    accountCheckinIcon.visibility = View.VISIBLE
                    accountCheckinText.text = "+${state.points}"
                }

                is CheckinState.Loading -> {
                    // 签到中状态
                    llCheckin.visibility = View.VISIBLE
                    llHasCheckin.visibility = View.GONE
                    accountCheckinIcon.visibility = View.GONE
                    accountCheckinText.text = "签到中"
                }

                is CheckinState.CheckedIn -> {
                    // 已签到状态
                    llCheckin.visibility = View.GONE
                    llHasCheckin.visibility = View.VISIBLE
                }
            }
        }
    }
}
