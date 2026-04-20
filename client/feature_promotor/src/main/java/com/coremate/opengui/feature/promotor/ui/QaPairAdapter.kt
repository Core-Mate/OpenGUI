package com.coremate.opengui.feature.promotor.ui

import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.feature.promotor.R

class QaPairAdapter(private val qaList: MutableList<QaPair>) :
    RecyclerView.Adapter<QaPairAdapter.QaPairViewHolder>() {

    class QaPairViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val tvQaNumber: TextView = itemView.findViewById(R.id.tv_qa_number)
        val etQuestion: EditText = itemView.findViewById(R.id.et_question)
        val etAnswer: EditText = itemView.findViewById(R.id.et_answer)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): QaPairViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_qa_pair, parent, false)
        return QaPairViewHolder(view)
    }

    override fun onBindViewHolder(holder: QaPairViewHolder, position: Int) {
        val qaPair = qaList[position]
        holder.tvQaNumber.text = (position + 1).toString()
        holder.etQuestion.setText(qaPair.question)
        holder.etAnswer.setText(qaPair.answer)

        // 防止 EditText 在 RecyclerView 复用时出现数据混乱
        holder.etQuestion.removeTextChangedListener(holder.etQuestion.tag as? TextWatcher)
        holder.etAnswer.removeTextChangedListener(holder.etAnswer.tag as? TextWatcher)

        val questionWatcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                qaPair.question = s.toString()
            }
            override fun afterTextChanged(s: Editable?) {}
        }
        holder.etQuestion.addTextChangedListener(questionWatcher)
        holder.etQuestion.tag = questionWatcher

        val answerWatcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                qaPair.answer = s.toString()
            }
            override fun afterTextChanged(s: Editable?) {}
        }
        holder.etAnswer.addTextChangedListener(answerWatcher)
        holder.etAnswer.tag = answerWatcher
    }

    override fun getItemCount(): Int = qaList.size

    // 获取所有问答对的方法，供 Fragment 调用
    fun getQaPairs(): List<QaPair> {
        return qaList.toList() // 返回副本以防外部修改
    }
}