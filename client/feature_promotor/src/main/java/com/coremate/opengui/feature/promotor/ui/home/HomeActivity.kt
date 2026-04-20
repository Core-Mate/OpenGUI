package com.coremate.opengui.feature.promotor.ui.home

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PersistableBundle
import android.view.LayoutInflater
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common.statistics.StatisticCustomError
import com.coremate.opengui.common.statistics.StatisticEvent
import com.coremate.opengui.common.statistics.StatisticsManager
import com.coremate.opengui.common_jvm.event.AutomationEvent
import com.coremate.opengui.common_jvm.event.AutomationEventBus
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.feature.promotor.databinding.ActivityHomeBinding
import com.coremate.opengui.feature.promotor.databinding.DialogInstallProgressBinding
import com.coremate.opengui.feature.promotor.ui.AIFloatWindowManager
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.feature.promotor.ui.summarizer.SummarizerActivity
import com.coremate.opengui.feature.promotor.ui.task.MyTaskFragment
import com.coremate.opengui.feature.promotor.ui.task.fragments.TaskCustomFragment
import com.coremate.opengui.feature.promotor.ui.task.fragments.TaskSelectFragment
import com.coremate.opengui.feature.promotor.ui.task.fragments.TaskSquareFragment
import com.coremate.opengui.feature.promotor.ui.window.AccessibilityServiceWarningWindow
import com.coremate.opengui.feature.promotor.ui.window.CallUserWindow
import com.coremate.opengui.feature.promotor.ui.window.ExecuteTaskWindow
import com.coremate.opengui.feature.promotor.ui.window.GradientWindow
import com.coremate.opengui.feature.promotor.ui.window.SlideExpandWindow
import com.coremate.opengui.feature.promotor.viewmodel.PromotorViewModel
import com.coremate.opengui.network.api.ApiService
import com.coremate.opengui.network.api.RetrofitClient
import com.coremate.opengui.network.websocket.StandbyForegroundService
import com.coremate.opengui.feature.promotor.common.MessageController
import com.coremate.opengui.accessibility.ActionExecutor
import com.coremate.opengui.feature.promotor.common.feedback.ClickFeedbackView
import com.coremate.opengui.network.api.ServerConstant
import com.coremate.opengui.network.upload.ImageUploaderImpl
import androidx.lifecycle.ViewModelProvider
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.io.File

class HomeActivity : BaseBindingActivity<ActivityHomeBinding>(ActivityHomeBinding::inflate){

    private var promotorViewModel: PromotorViewModel? = null
    private var installDialog: AlertDialog? = null
    private var installDialogBinding: DialogInstallProgressBinding? = null

    private val taskFragment = MyTaskFragment()

    override fun onCreate(savedInstanceState: Bundle?, persistentState: PersistableBundle?) {
        super.onCreate(savedInstanceState, persistentState)

        lifecycleScope.launch {
            val apiService: ApiService = RetrofitClient.create(this@HomeActivity)
            kotlin.runCatching {
                apiService.cancelAllTask()
            }.onSuccess {
                LogManager.saveLog(
                    applicationContext, "MainActivity",
                    "MainActivity | onCreate | app 启动，先停止该设备下所有任务，停止结果 code = ${it.code()}  body = ${it.body()}",
                    TaskCenter.executionId ?: -1
                )
                val eventParams = mutableMapOf<String, Any>(
                    "URL_REQ" to "MainActivity | onCreate | app 启动，先停止该设备下所有任务，停止结果 code = ${it.code()}  body = ${it.body()}"
                )
                StatisticsManager.instance.onUploadEvent(StatisticEvent.URL_REQUEST, eventParams)
            }.onFailure {
                it.printStackTrace()
                LogManager.saveLog(
                    applicationContext, "MainActivity",
                    "MainActivity | onCreate | app 启动，先停止该设备下所有任务，停止失败，${it.message}",
                    TaskCenter.executionId ?: -1
                )
                StatisticsManager.instance.onUploadException(
                    StatisticCustomError.API_ERR,
                    it.message ?: "取消任务接口异常"
                )
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    override fun initView() {
        // 启动待命服务，等待远程任务派发
        StandbyForegroundService.start(this)

        val executeTaskWindow = ExecuteTaskWindow(this)
        val slideExpandWindow = SlideExpandWindow(this)
        val callUserWindow = CallUserWindow(this)
        val gradientWindow = GradientWindow(this)
        val accessibilityServiceWarningWindow = AccessibilityServiceWarningWindow(this)

        promotorViewModel = ViewModelProvider(
            this,
            ViewModelProvider.AndroidViewModelFactory.getInstance(application)
        )[PromotorViewModel::class.java]

        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, taskFragment)
            .commit()
    }

    override fun initEvent() {
        binding.btAddTask.setOnClickListener {
            showAddTaskBottomSheet()
        }

        lifecycleScope.launch {
            AutomationEventBus.events.collectLatest { event ->
                if (event is AutomationEvent.ReturnToPromotorApp) {
                    returnToApp()
                    // 执行完成后重连待命
                    StandbyForegroundService.standbyManager?.reconnect()
                }
                if (event is AutomationEvent.ErrorReturnToPromotorApp) {
                    returnToApp()
                }
                if (event is AutomationEvent.EventLogout) {
                    finish()
                }
                if (event is AutomationEvent.AccessibilityServiceWarningEvent){
                    AIFloatWindowManager.hideExecuteTaskWindow("AccessibilityServiceWarning")
                    AIFloatWindowManager.getSlideExpandWindow()?.dismiss("AccessibilityServiceWarning")
                    AIFloatWindowManager.getAccessibilityServiceWarningWindow()?.show()
                }
                if (event is AutomationEvent.RemoteDispatch) {
                    handleRemoteDispatch(event)
                }
            }
        }
    }

    override fun initParam() {
        presenter = HomePresenter(this)
    }

    /**
     * 处理远程任务派发：设置 TaskCenter 状态，连接执行 WS。
     * Server 已创建 execution（PENDING），手机只需连 WS 发 execution:ready。
     */
    private fun handleRemoteDispatch(event: AutomationEvent.RemoteDispatch) {
        LogManager.saveLog(applicationContext, "HomeActivity",
            "Remote dispatch: execution=${event.executionId}, task=${event.taskName}", -1)

        // 设置 TaskCenter（和手动点击执行时一样）
        TaskCenter.reset(this, "远程执行")
        TaskCenter.taskId = event.taskId
        TaskCenter.taskTitle = event.taskName
        TaskCenter.executionId = event.executionId

        // 确保 actionHandler 存在（和 PromptExecutionActivity.initParam 一样创建）
        if (MessageController.getActionHandler() == null) {
            val imageUploader = ImageUploaderImpl("", ServerConstant.getURL())
            val clickFeedbackView = ClickFeedbackView(applicationContext)
            val actionExecutor = ActionExecutor(applicationContext, imageUploader, clickFeedbackView)
            MessageController.init(
                this,
                actionExecutor,
                object : MessageController.TabCheckCallback {
                    override fun onCheck(tabIndex: Int) {}
                }
            )
        }

        // 连接执行 WS（复用 MessageController 的现有流程）
        val execId = event.executionId.toLong()
        MessageController.connectExecutionSocket(execId, MessageController.getActionHandler()!!)

        // 断开 standby 连接（执行期间不需要）
        StandbyForegroundService.standbyManager?.disconnect()
    }

    private var presenter: HomePresenter? = null

    override fun onResume() {
        super.onResume()
        presenter?.loadAppConfig(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val executeTaskDone = intent.getBooleanExtra("ExecuteTaskDone", false)
        if (executeTaskDone) {
            val intent = Intent(this, SummarizerActivity::class.java)
            startActivity(intent)
        }
    }

    private fun showAddTaskBottomSheet() {
        val bottomSheetDialog = TaskSelectFragment()
        bottomSheetDialog.listener = object : TaskSelectFragment.TaskSelectFragmentListener {
            override fun onClickRecommendOption() {
                showRecommendOption()
            }

            override fun onClickCustomOption() {
                showCustomOption()
            }
        }
        bottomSheetDialog.show(
            supportFragmentManager,
            TaskSelectFragment::class.java.simpleName
        )
    }

    private fun showRecommendOption() {
        val bottomSheetDialog = TaskSquareFragment()
        bottomSheetDialog.show(
            supportFragmentManager,
            TaskSquareFragment::class.java.simpleName
        )
    }

    private fun showCustomOption() {
        val intent = Intent(this, TaskCustomFragment::class.java)
        startActivityForResult(intent, 1001)
    }

    private fun returnToApp() {
        val intent = Intent(this, HomeActivity::class.java).apply {
            action = Intent.ACTION_MAIN
            addCategory(Intent.CATEGORY_LAUNCHER)
            addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        intent.putExtra("ExecuteTaskDone", true)
        startActivity(intent)
    }

    fun installApk(apkFile: File) {
        if (!apkFile.exists()) return
        val intent = Intent(Intent.ACTION_VIEW)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val apkUri = FileProvider.getUriForFile(
                this,
                this.getPackageName() + ".fileprovider", apkFile
            )
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive")
        } else {
            intent.setDataAndType(Uri.fromFile(apkFile), "application/vnd.android.package-archive")
        }
        startActivity(intent)
    }

    fun showInstallProgressDialog() {
        val dialogBinding = DialogInstallProgressBinding.inflate(LayoutInflater.from(this))
        installDialogBinding = dialogBinding

        installDialog = AlertDialog.Builder(this)
            .setView(dialogBinding.root)
            .setCancelable(false)
            .create()

        dialogBinding.btnCancel.setOnClickListener {
            dismissInstallProgressDialog()
        }

        installDialog?.show()
    }

    fun updateInstallProgress(progress: Int) {
        installDialogBinding?.let { binding ->
            val progressValue = progress.coerceIn(0, 100)
            binding.progressBar.progress = progressValue
            binding.tvProgressText.text = "$progressValue%"
        }
    }

    fun dismissInstallProgressDialog() {
        installDialog?.dismiss()
        installDialog = null
        installDialogBinding = null
    }
}
