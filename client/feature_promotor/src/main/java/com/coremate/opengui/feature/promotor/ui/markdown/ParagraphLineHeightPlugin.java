package com.coremate.opengui.feature.promotor.ui.markdown;

import androidx.annotation.NonNull;

import org.commonmark.node.Paragraph;

import io.noties.markwon.AbstractMarkwonPlugin;
import io.noties.markwon.MarkwonConfiguration;
import io.noties.markwon.MarkwonSpansFactory;
import io.noties.markwon.RenderProps;
import io.noties.markwon.SpanFactory;

public class ParagraphLineHeightPlugin extends AbstractMarkwonPlugin {
    private final int lineHeight;

    public ParagraphLineHeightPlugin(int lineHeight) {
        this.lineHeight = lineHeight;
    }

    @Override
    public void configureSpansFactory(@NonNull MarkwonSpansFactory.Builder builder) {
        // 针对段落设置行高
        builder.setFactory(Paragraph.class, new SpanFactory() {
            @Override
            public Object getSpans(
                    @NonNull MarkwonConfiguration config,
                    @NonNull RenderProps props
            ) {
                return new LineHeightSpanImpl(lineHeight);
            }
        });
    }
}
