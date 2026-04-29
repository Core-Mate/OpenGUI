package com.coremate.opengui.feature.promotor.ui.summarizer

import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.os.Build
import android.os.Environment
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.util.Log
import android.util.TypedValue
import android.view.View
import android.view.View.GONE
import android.view.View.VISIBLE
import android.view.animation.AnimationUtils
import android.widget.Toast
import android.widget.ProgressBar
import androidx.annotation.NonNull
import androidx.annotation.RequiresApi
import androidx.core.content.FileProvider
import androidx.appcompat.app.AlertDialog
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.common.log.LogManager
import com.coremate.opengui.common.utils.TimeUtils
import com.coremate.opengui.feature.promotor.R
import com.coremate.opengui.common.TaskCenter
import com.coremate.opengui.feature.promotor.common.markdown.MarkwonManager
import com.coremate.opengui.feature.promotor.databinding.ActivitySummarizerBinding
import com.coremate.opengui.feature.promotor.ui.base.BaseBindingActivity
import com.coremate.opengui.network.api.task.TaskExecutionsResult
import kotlinx.coroutines.coroutineScope
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import androidx.core.graphics.toColorInt
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.gson.Gson
import com.coremate.opengui.feature.promotor.common.MessageController
import com.coremate.opengui.feature.promotor.ui.markdown.LineHeightSpanImpl
import com.coremate.opengui.feature.promotor.ui.markdown.ParagraphLineHeightPlugin
import com.coremate.opengui.feature.promotor.ui.markdown.TableEntry
import com.coremate.opengui.feature.promotor.ui.markdown.TableEntryPlugin
import com.coremate.opengui.feature.promotor.ui.markdown.XMNotTableEntry
import com.coremate.opengui.feature.promotor.ui.markdown.latex.JLatexMathPlugin
import com.coremate.opengui.feature.promotor.util.calculateDuration
import com.coremate.opengui.network.api.task.Extra
import io.noties.markwon.AbstractMarkwonPlugin
import io.noties.markwon.Markwon
import io.noties.markwon.MarkwonConfiguration
import io.noties.markwon.MarkwonSpansFactory
import io.noties.markwon.MarkwonVisitor
import io.noties.markwon.core.CoreProps
import io.noties.markwon.core.MarkwonTheme
import io.noties.markwon.ext.latex.JLatexMathBlock
import io.noties.markwon.ext.tables.TableAwareMovementMethod
import io.noties.markwon.html.HtmlPlugin
import io.noties.markwon.inlineparser.MarkwonInlineParserPlugin
import io.noties.markwon.movement.MovementMethodPlugin
import io.noties.markwon.recycler.MarkwonAdapter
import io.noties.markwon.syntax.Prism4jThemeDarkula
import io.noties.markwon.syntax.SyntaxHighlightPlugin
import io.noties.prism4j.GrammarLocator
import io.noties.prism4j.Prism4j
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.Heading
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.Text
import org.commonmark.node.ThematicBreak
import org.json.JSONObject
import java.util.concurrent.Executors

class SummarizerActivity :
    BaseBindingActivity<ActivitySummarizerBinding>(ActivitySummarizerBinding::inflate) {
    private var from: String? = null
    private var presenter: SummarizerPresenter? = null


    private var taskId: String? = null
    private var taskName: String? = null
    private var historyId: String? = null
    private var timeText: String? = null
    private var executionResult: String? = null
    private var isDownloading = false
    private var markwon: Markwon? = null
    private var markwonAdapter: MarkwonAdapter? = null
    private var exportLoadingDialog: AlertDialog? = null


    private var userScrolledUp = false
    private val THEME_COLOR: Int = -0xa0a0b
    private val TEXT_COLOR: Int = -0xcccccd
    override fun initView() {
        MessageController.stopHeartBeatRequest()
        LogManager.saveLog(
            this,
            "SummarizerActivity",
            "initView ,from=$from, executionId=${TaskCenter.executionId}",
            TaskCenter.executionId ?: -1
        )
        binding.titlebar
            .setTitle("")
            .setLeftIconClickListener { finish() }
        binding.titlebar.setBackground(R.color.white)
        binding.titlebar.getMenu0Btn().apply {
            visibility = GONE
            setImageResource(R.drawable.icon_download)
            setOnClickListener {
                val name = taskName ?: "Task"
                val fileName = "OpenGUI_${name.take(20)}.pdf"
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) ?: filesDir
                val file = File(dir, fileName)
                exportRecyclerViewToPdf(binding.rvSummarizerContent, file)
            }
            setPadding(
                AMScreenUtils.dp2px(7f),
                AMScreenUtils.dp2px(7f),
                AMScreenUtils.dp2px(7f),
                AMScreenUtils.dp2px(7f),
            )
        }
        binding.titlebar.getMoreBtn().apply {
            setImageResource(R.drawable.ic_share)
            alpha = 0.5f
            imageTintList = ColorStateList.valueOf(Color.parseColor("#6B7280"))
            setOnClickListener {
                //TODO:Share
            }
            setPadding(
                AMScreenUtils.dp2px(7f),
                AMScreenUtils.dp2px(7f),
                AMScreenUtils.dp2px(7f),
                AMScreenUtils.dp2px(7f),
            )
        }

        binding.tvTaskTitle.text = if (!taskName.isNullOrEmpty()) taskName else TaskCenter.taskTitle

        updateStatusBadge()
        when (from) {
            "MyTask", "TaskFinish" -> {

                val executionId = TaskCenter.executionId
                if (executionId != null) {
                    presenter?.getTaskExecutionsSummarizer(executionId)
                }
            }

            "CancelTask" -> {
                if (TaskCenter.executionId != null) {
                    presenter?.cancelTask(TaskCenter.executionId!!)
                }
            }

            "MyTaskEdit" -> {
                binding.loadingContainer.visibility = GONE
                binding.imgLoading.clearAnimation()
                markwonAdapter!!.setMarkdown(markwon!!, "No feedback for this task")
                markwonAdapter?.notifyDataSetChanged()
                scrollToBottom()
            }
        }
    }

    private fun scrollToBottom() {
        if (userScrolledUp) {

            return
        }
        if (markwonAdapter != null && markwonAdapter?.itemCount!! > 0) {

            val lastPosition = markwonAdapter?.itemCount?.minus(1)
            binding.rvSummarizerContent.scrollToPosition(lastPosition!!)

            binding.rvSummarizerContent.post {
                val layoutManager =
                    binding.rvSummarizerContent.layoutManager as LinearLayoutManager?
                layoutManager?.scrollToPositionWithOffset(lastPosition, 0)
            }
        }
    }

    private fun updateStatusBadge() {
        if (executionResult != null) {
            binding.layoutStatusBadge.visibility = VISIBLE
            val isSuccess = "SUCCEED" == executionResult
            binding.tvStatus.text =
                if ("SUCCEED" == executionResult) "Execution Succeeded" else if ("CANCELLED" == executionResult) "Execution Cancelled" else "Execution Failed"

            if (isSuccess) {
                binding.tvStatus.setTextColor("#059669".toColorInt())
                binding.layoutStatusBadge.setBackgroundResource(R.drawable.bg_status_success)
                binding.viewStatusDot.setBackgroundResource(R.drawable.bg_status_dot_success)
            } else {
                binding.tvStatus.setTextColor("#DC2626".toColorInt())
                binding.layoutStatusBadge.setBackgroundResource(R.drawable.bg_status_failed)
                binding.viewStatusDot.setBackgroundResource(R.drawable.bg_status_dot_failed)
            }
        }
    }

    private fun streamUpdateStatusBadge(extraStr: JSONObject?) {
        var isSuccess: Boolean
        if (extraStr == null) {
            isSuccess = false
        } else {
            val extra = Gson().fromJson(extraStr.toString(), Extra::class.java)
            if (extra == null || extra.extraResult == null) {
                isSuccess = false
                binding.tvStatus.text = "Execution Cancelled"
            } else {
                if (extra.extraResult?.success == true) {
                    isSuccess = true
                    binding.tvStatus.text = "Execution Succeeded"
                } else {
                    isSuccess = false
                    binding.tvStatus.text = "Execution Failed"
                }
            }
        }
        if (isSuccess) {
            binding.tvStatus.setTextColor("#059669".toColorInt())
            binding.layoutStatusBadge.setBackgroundResource(R.drawable.bg_status_success)
            binding.viewStatusDot.setBackgroundResource(R.drawable.bg_status_dot_success)
        } else {
            binding.tvStatus.setTextColor("#DC2626".toColorInt())
            binding.layoutStatusBadge.setBackgroundResource(R.drawable.bg_status_failed)
            binding.viewStatusDot.setBackgroundResource(R.drawable.bg_status_dot_failed)
        }
        binding.layoutStatusBadge.visibility = VISIBLE
    }

    override fun initEvent() {
        var content = ""
        MessageController.setSummaryCallback(object :
            MessageController.SummaryCallback {
            override fun updateResultSummary(debugFrom:String,summary: String?, isFinish: Boolean, extra: JSONObject?) {
                try {
                    if (isFinish) {
                        binding.titlebar.getMenu0Btn().apply {
                            visibility = VISIBLE
                        }
                        TaskCenter.isSummarizing = false

                        TaskCenter.executionId?.let { execId ->
                            presenter?.getTaskExecutionsSummarizer(execId)
                        }
                        MessageController.cancelNetConnection("Summary page stream finished")
                    } else {
                        binding.loadingContainer.visibility = GONE
                        binding.imgLoading.clearAnimation()
                        content += summary
                        Log.d("TAG", "updateResultSummary: $content")
                        markwonAdapter!!.setMarkdown(markwon!!, content)
                        markwonAdapter?.notifyDataSetChanged()
                        scrollToBottom()
                    }
                    streamUpdateStatusBadge(extra)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        })
    }

    @RequiresApi(Build.VERSION_CODES.O)
    override fun initParam() {
        TaskCenter.isSummarizing = true
        presenter = SummarizerPresenter(this)
        from = intent.getStringExtra("from")

        taskId = intent.getStringExtra("id")
        taskName = intent.getStringExtra("taskName")
        historyId = intent.getStringExtra("historyId")
        timeText = intent.getStringExtra("timeText")
        executionResult = intent.getStringExtra("executionResult")

        if (TaskCenter.executionId == null && taskId != null) {
            TaskCenter.executionId = taskId?.toIntOrNull()
        }
        val rotateAnimation = AnimationUtils.loadAnimation(this, R.anim.rotate_loading)
        binding.imgLoading.startAnimation(rotateAnimation)
        presenter = SummarizerPresenter(this)
        setupMarkdown()
    }

    override fun onDestroy() {
        super.onDestroy()

        MessageController.cancelNetConnection("Summary page destroyed")
        TaskCenter.isSummarizing = false
    }

    override fun onBackPressed() {
        super.onBackPressed()
        MessageController.cancelNetConnection("onBackPressed")
    }

    fun updateResultSummary(result: TaskExecutionsResult?) {
        binding.loadingContainer.visibility = GONE
        binding.imgLoading.clearAnimation()
        val duration = calculateDuration(
            result?.startedAt,
            result?.finishedAt
        )
        if (duration != null) {
            binding.tvTimeInfo.text =
                "Duration: ${calculateDuration(result?.startedAt, result?.finishedAt)}"
        } else {
            binding.tvTimeInfo.text = "Unknown duration"
        }

        result?.let {
            runCatching {
                runOnUiThread {
                    binding.titlebar.getMenu0Btn().apply {
                        visibility = VISIBLE
                    }
                    markwonAdapter!!.setMarkdown(
                        markwon!!,
                        it.executionResultSummary ?: "No feedback for this task"
                    )
                    markwonAdapter?.notifyDataSetChanged()
                }
            }.onFailure {
                it.printStackTrace()
            }
        }
    }

    fun exportRecyclerViewToPdf(recyclerView: RecyclerView, pdfFile: File) {
        val adapter = recyclerView.adapter ?: return
        showExportLoading()
        val document = PdfDocument()
        val pageWidth = 595
        val pageHeight = 842
        val contentWidth = pageWidth - (2 * 20)
        var currentHeight = 20
        var pageNumber = 1
        var pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create()
        var page = document.startPage(pageInfo)
        var canvas = page.canvas
        try {
            for (i in 0 until adapter.itemCount) {
                val holder = adapter.createViewHolder(recyclerView, adapter.getItemViewType(i))
                adapter.onBindViewHolder(holder, i)
                val itemView = holder.itemView

                val widthSpec =
                    View.MeasureSpec.makeMeasureSpec(contentWidth, View.MeasureSpec.EXACTLY)
                val heightSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
                itemView.measure(widthSpec, heightSpec)
                itemView.layout(0, 0, itemView.measuredWidth, itemView.measuredHeight)

                if (currentHeight + itemView.measuredHeight + 20 > pageHeight) {
                    document.finishPage(page)
                    pageNumber++
                    pageInfo =
                        PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create()
                    page = document.startPage(pageInfo)
                    canvas = page.canvas
                    currentHeight = 20
                }

                canvas.save()
                canvas.translate(20.toFloat(), currentHeight.toFloat())
                itemView.draw(canvas)
                canvas.restore()
                currentHeight += itemView.measuredHeight
            }
            document.finishPage(page)
            FileOutputStream(pdfFile).use { document.writeTo(it) }
            shareOrOpenPdf(pdfFile, pdfFile.name)
            Toast.makeText(this, "PDF downloaded", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "PDF export failed. Please try again.", Toast.LENGTH_SHORT).show()
        } finally {
            document.close()
            hideExportLoading()
        }
    }

    private fun showExportLoading() {
        if (exportLoadingDialog == null) {
            val progressBar = ProgressBar(this)
            progressBar.isIndeterminate = true
            exportLoadingDialog = AlertDialog.Builder(this)
                .setView(progressBar)
                .setMessage("Exporting PDF...")
                .setCancelable(false)
                .create()
        }
        if (exportLoadingDialog?.isShowing != true) {
            exportLoadingDialog?.show()
        }
    }

    private fun hideExportLoading() {
        exportLoadingDialog?.dismiss()
    }

    private fun shareOrOpenPdf(file: File, fileName: String) {
        val uri = FileProvider.getUriForFile(
            this,
            "${packageName}.fileprovider",
            file
        )
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(intent, "Save or share PDF"))
    }

    /**
     */
    @RequiresApi(Build.VERSION_CODES.O)
    private fun setupMarkdown() {
        val lineHeightPx = dp2px(this, 30f)

        @Suppress("UNCHECKED_CAST")
        val prism4j = try {
            // Try to load the generated MyGrammarLocator class dynamically
            val grammarLocatorClass =
                Class.forName("com.coremate.opengui.feature.promotor.ui.markdown.MyGrammarLocator")
            val instance = grammarLocatorClass.newInstance()
            Prism4j(instance as GrammarLocator)
        } catch (e: Exception) {
            // Fallback: try without a grammar locator or use reflection
            try {
                // Try to create a default instance using reflection
                val prism4jClass = Prism4j::class.java
                val constructors = prism4jClass.constructors
                // Find constructor that accepts null or GrammarLocator
                val constructor = constructors.firstOrNull {
                    it.parameterCount == 0
                }
                if (constructor != null) {
                    constructor.newInstance() as Prism4j
                } else {
                    // Use the one-argument constructor with null
                    val nullConstructor = constructors.first { it.parameterCount == 1 }
                    nullConstructor.newInstance(null) as Prism4j
                }
            } catch (ex: Exception) {
                throw RuntimeException("Failed to create Prism4j instance", ex)
            }
        }
        markwon = Markwon.builder(this)
            .usePlugin(TableEntryPlugin.create(this))
            .usePlugin(SyntaxHighlightPlugin.create(prism4j, Prism4jThemeDarkula.create()))
            .usePlugin(object : AbstractMarkwonPlugin() {
                override fun configureTheme(@NonNull builder: MarkwonTheme.Builder) {
                    builder.codeTextColor(TEXT_COLOR)
                        .codeBackgroundColor(THEME_COLOR)
                        .codeBlockTextColor(TEXT_COLOR)
                        .codeBlockBackgroundColor(THEME_COLOR)
                        .blockMargin(16)
                        .blockQuoteWidth(0)
                        .listItemColor(TEXT_COLOR)
                        .bulletWidth(8)
                }

                override fun configureConfiguration(@NonNull builder: MarkwonConfiguration.Builder) {
                    builder.linkResolver { view, link ->
                    }
                }

                override fun configureVisitor(@NonNull builder: MarkwonVisitor.Builder) {
                    builder.on(
                        Heading::class.java
                    ) { visitor, heading ->
                        visitor.ensureNewLine()
                        val length = visitor.length()
                        visitor.visitChildren(heading)
                        CoreProps.HEADING_LEVEL[visitor.renderProps()] = heading.level
                        visitor.setSpansForNodeOptional(heading, length)
                    }
                }

                override fun configureSpansFactory(@NonNull builder: MarkwonSpansFactory.Builder) {
                    builder.setFactory(
                        Paragraph::class.java
                    ) { config, props -> LineHeightSpanImpl(lineHeightPx.toInt()) }
                }
            })
            .usePlugin(MarkwonInlineParserPlugin.create())
            .usePlugin(HtmlPlugin.create())
            .usePlugin(JLatexMathPlugin.create(dp2px(this, 16f)) { builder ->
                builder.inlinesEnabled(true)
                builder.executorService(Executors.newCachedThreadPool())
            })
            .usePlugin(MovementMethodPlugin.create(TableAwareMovementMethod.create()))
            .usePlugin(ParagraphLineHeightPlugin(lineHeightPx.toInt()))
            .build()
        // Create MarkwonAdapter
        val adapterBuilder = MarkwonAdapter.builder(R.layout.adapter_node, R.id.text_view)
        val simpleEntry = XMNotTableEntry(R.layout.adapter_fenced_code_block, R.id.text)
        markwonAdapter = adapterBuilder
            .include(TableBlock::class.java, TableEntry.create { tableBuilder ->
                tableBuilder
                    .tableLayout(R.layout.adapter_node_table_block, R.id.table_layout)
                    .textLayoutIsRoot(R.layout.view_table_entry_cell)
            })
            .include(Text::class.java, simpleEntry)
            .include(Heading::class.java, simpleEntry)
            .include(FencedCodeBlock::class.java, simpleEntry)
            .include(Paragraph::class.java, simpleEntry)
            .include(OrderedList::class.java, simpleEntry)
            .include(BulletList::class.java, simpleEntry)
            .include(BlockQuote::class.java, simpleEntry)
            .include(JLatexMathBlock::class.java, simpleEntry)
            .include(ThematicBreak::class.java, simpleEntry)
            .build()
        binding.rvSummarizerContent.layoutManager = LinearLayoutManager(this)
        binding.rvSummarizerContent.adapter = markwonAdapter
        binding.rvSummarizerContent.itemAnimator = null
        binding.rvSummarizerContent.isNestedScrollingEnabled = false

        binding.rvSummarizerContent.addOnScrollListener(object :
            RecyclerView.OnScrollListener() {
            override fun onScrolled(
                recyclerView: RecyclerView,
                dx: Int,
                dy: Int
            ) {
                super.onScrolled(recyclerView, dx, dy)

                if (dy < 0) {
                    userScrolledUp = true
                }

                val layoutManager = recyclerView.layoutManager as LinearLayoutManager?
                if (layoutManager != null) {
                    val lastVisiblePosition = layoutManager.findLastVisibleItemPosition()
                    val totalItemCount = layoutManager.itemCount

                    if (lastVisiblePosition >= totalItemCount - 1) {
                        userScrolledUp = false
                    }
                }
            }
        })
    }

    fun dp2px(context: Context, dpValue: Float): Float {
        val metrics = context.resources.displayMetrics
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dpValue, metrics)
    }
}