package com.coremate.opengui.feature.promotor.common.markdown;

import android.content.Context;
import android.graphics.Color;
import android.text.Spanned;
import android.util.TypedValue;
import android.widget.TextView;


import androidx.annotation.NonNull;


import com.coremate.opengui.feature.promotor.common.markdown.MyGrammarLocator;

import org.commonmark.node.Heading;

import io.noties.markwon.AbstractMarkwonPlugin;
import io.noties.markwon.Markwon;
import io.noties.markwon.MarkwonConfiguration;
import io.noties.markwon.MarkwonSpansFactory;
import io.noties.markwon.MarkwonVisitor;
import io.noties.markwon.core.CoreProps;
import io.noties.markwon.core.MarkwonTheme;
import io.noties.markwon.ext.tables.TableAwareMovementMethod;
import io.noties.markwon.ext.tables.TablePlugin;
import io.noties.markwon.html.HtmlPlugin;
import io.noties.markwon.inlineparser.MarkwonInlineParserPlugin;
import io.noties.markwon.movement.MovementMethodPlugin;
import io.noties.markwon.syntax.Prism4jThemeDefault;
import io.noties.markwon.syntax.SyntaxHighlightPlugin;
import io.noties.prism4j.Prism4j;
import io.noties.prism4j.annotations.PrismBundle;

@PrismBundle(include = {"java", "kotlin", "python", "javascript", "css", "markup", "c", "cpp"}, grammarLocatorClassName = ".MyGrammarLocator"  // Customize the grammar locator here.
)
public class MarkwonManager {
    private static volatile MarkwonManager instance;
    private Markwon markwon;


    private static final int THEME_COLOR = Color.parseColor("#f5f5f5");  // Background color.
    private static final int TEXT_COLOR = Color.parseColor("#333333");   // Default text color.

    float lineHeightDp = 30;
    int lineHeightPx = 0;

    private MarkwonManager() {
    }

    public static MarkwonManager getInstance() {
        if (instance == null) {
            synchronized (MarkwonManager.class) {
                if (instance == null) {
                    instance = new MarkwonManager();
                }
            }
        }
        return instance;
    }

    public void init(Context context) {
        if (markwon != null) {
            return;
        }
        lineHeightPx = (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                lineHeightDp,
                context.getResources().getDisplayMetrics()
        );


        Prism4j prism4j = new Prism4j(new MyGrammarLocator());


        markwon = Markwon.builder(context)

                .usePlugin(SyntaxHighlightPlugin.create(prism4j, Prism4jThemeDefault.create()))

                .usePlugin(new AbstractMarkwonPlugin() {
                    @Override
                    public void configureTheme(@NonNull MarkwonTheme.Builder builder) {
                        builder.codeTextColor(TEXT_COLOR)
                                .codeBackgroundColor(THEME_COLOR)
                                .codeBlockTextColor(TEXT_COLOR)
                                .codeBlockBackgroundColor(THEME_COLOR)
                                .blockMargin(16)
                                .blockQuoteWidth(0)
                                .listItemColor(TEXT_COLOR)
                                .bulletWidth(8);
                    }

                    @Override
                    public void configureConfiguration(@NonNull MarkwonConfiguration.Builder builder) {
                    }

                    @Override
                    public void configureVisitor(@NonNull MarkwonVisitor.Builder builder) {
                        builder.on(Heading.class, new MarkwonVisitor.NodeVisitor<Heading>() {
                            @Override
                            public void visit(@NonNull MarkwonVisitor visitor, @NonNull Heading heading) {
                                visitor.ensureNewLine();
                                int length = visitor.length();
                                visitor.visitChildren(heading);
                                CoreProps.HEADING_LEVEL.set(visitor.renderProps(), heading.getLevel());
                                visitor.setSpansForNodeOptional(heading, length);
                            }
                        });
                    }

                    @Override
                    public void configureSpansFactory(@NonNull MarkwonSpansFactory.Builder builder) {

                    }
                })
                .usePlugin(MarkwonInlineParserPlugin.create())
                .usePlugin(HtmlPlugin.create())
                .usePlugin(TablePlugin.create(context))
                .usePlugin(MovementMethodPlugin.create(TableAwareMovementMethod.create()))
                .build();
    }

    public void setMarkdown(Context context, TextView textView, String markdown) {
        if (markwon == null) {
            init(context);
        }
        markwon.setMarkdown(textView, markdown.replace("[citation:", "[").replace("[citiation:", "["));
    }

    public Spanned toMarkdown(String markdown, Context context) {
        if (markwon == null) {
            init(context);
        }
        return markwon.toMarkdown(markdown);
    }

    private void checkInit() {
        if (markwon == null) {
            throw new IllegalStateException("MarkwonManager not initialized! Call init() first!");
        }
    }

    public Markwon getMarkwon(Context context) {
        if (markwon == null) {
            init(context);
        }
        return markwon;
    }


}
