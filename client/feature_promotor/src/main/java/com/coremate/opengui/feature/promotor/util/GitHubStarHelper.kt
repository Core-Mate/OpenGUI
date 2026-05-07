package com.coremate.opengui.feature.promotor.util

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast

object GitHubStarHelper {
    private const val REPOSITORY_URL = "https://github.com/Core-Mate/open-gui"
    private const val PREF_NAME = "opengui_star_cta"
    private const val KEY_FIRST_SUCCESS_PROMPT_SHOWN = "first_success_prompt_shown"

    fun openRepository(context: Context) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(REPOSITORY_URL)).apply {
            if (context !is Activity) {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
        runCatching {
            context.startActivity(intent)
        }.onFailure {
            Toast.makeText(context, "Could not open GitHub", Toast.LENGTH_SHORT).show()
        }
    }

    fun shouldShowFirstSuccessPrompt(context: Context): Boolean {
        return !context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_FIRST_SUCCESS_PROMPT_SHOWN, false)
    }

    fun markFirstSuccessPromptShown(context: Context) {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_FIRST_SUCCESS_PROMPT_SHOWN, true)
            .apply()
    }
}
