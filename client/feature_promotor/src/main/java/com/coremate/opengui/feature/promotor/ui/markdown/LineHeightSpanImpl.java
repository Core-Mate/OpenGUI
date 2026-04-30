package com.coremate.opengui.feature.promotor.ui.markdown;

import android.graphics.Paint;
import android.text.style.LineHeightSpan;

import androidx.annotation.Px;

public class LineHeightSpanImpl implements LineHeightSpan {
    private final int mHeight;

    public LineHeightSpanImpl(@Px int lineHeight) {
        this.mHeight = lineHeight;
    }

    @Override
    public void chooseHeight(CharSequence text, int start, int end, int spanstartv, int v, Paint.FontMetricsInt fm) {

        final int originHeight = fm.descent - fm.ascent;
        if (originHeight <= 0) return;

        final float ratio = this.mHeight * 1.0F / originHeight;
        fm.ascent = (int) (fm.ascent * ratio);
        fm.descent = (int) (fm.descent * ratio);
    }
}