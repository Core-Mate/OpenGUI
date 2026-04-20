package com.coremate.opengui.common.utils;

import android.content.Context;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;


/**
 * 键盘工具
 */
public class KeyboardUtil {

    /**
     * 打开键盘
     *
     * @param mEditText
     */
    public static void openKeyboard(Context context, EditText mEditText) {
        InputMethodManager imm = (InputMethodManager) context
                .getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.showSoftInput(mEditText, InputMethodManager.SHOW_FORCED);
        imm.toggleSoftInput(InputMethodManager.SHOW_FORCED,
                InputMethodManager.HIDE_IMPLICIT_ONLY);
    }

    /**
     * 关闭软键盘
     *
     * @param mEditText
     */
    public static void closeKeyboard(EditText mEditText) {
        InputMethodManager imm = (InputMethodManager) mEditText.getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        imm.hideSoftInputFromWindow(mEditText.getWindowToken(), 0);
    }

}
