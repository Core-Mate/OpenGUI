package com.coremate.opengui.feature.promotor.ui.markdown;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.text.LineBreaker;
import android.os.Build;
import android.text.Spannable;
import android.text.Spanned;
import android.text.style.BackgroundColorSpan;
import android.util.DisplayMetrics;
import android.util.Pair;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.IdRes;
import androidx.annotation.LayoutRes;
import androidx.annotation.NonNull;

import org.commonmark.node.Node;

import java.util.HashMap;
import java.util.Map;

import io.noties.markwon.Markwon;
import io.noties.markwon.recycler.MarkwonAdapter;
import io.noties.markwon.utils.NoCopySpannableFactory;

public class XMNotTableEntry extends MarkwonAdapter.Entry<Node, XMNotTableEntry.Holder> {
    private final int layoutResId;
    private final int textViewIdRes;
    private Rect msgListRectOnScreen = new Rect();
    private static final String TAG = "XMNotTableEntry";

    public XMNotTableEntry(@LayoutRes int layoutResId, @IdRes int textViewIdRes) {
        this.layoutResId = layoutResId;
        this.textViewIdRes = textViewIdRes;
    }

    @NonNull
    @Override
    public Holder createHolder(@NonNull LayoutInflater inflater, @NonNull ViewGroup parent) {
        return new Holder(textViewIdRes, inflater.inflate(layoutResId, parent, false));
    }

    private final Map<Node, Spanned> cache = new HashMap<>();
    /**
     */
    private final Map<Node, Pair<Integer, Integer>> cursorCache = new HashMap<>();

    @Override
    public void bindHolder(@NonNull Markwon markwon, @NonNull Holder holder, @NonNull Node node) {
        try {
            Spanned spanned = cache.get(node);
            if (spanned == null) {
                spanned = markwon.render(node);
                cache.put(node, spanned);
                cursorCache.put(node, Pair.create(-1, -1));
            }

            markwon.setParsedMarkdown(holder.textView, spanned);
            


            holder.textView.setBreakStrategy(LineBreaker.BREAK_STRATEGY_HIGH_QUALITY); // 2 = BREAK_STRATEGY_HIGH_QUALITY
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                holder.textView.setLineHeight(dp2px(holder.textView.getContext(),15f));
            }

            GestureDetector gd = new GestureDetector(holder.textView.getContext(), new GestureDetector.SimpleOnGestureListener() {
                @Override
                public void onLongPress(@NonNull MotionEvent e) {
                    if (touchCallback != null) {
                        touchCallback.onLongPress(node, holder.textView, e, position);
                    }
                }

                @Override
                public boolean onSingleTapConfirmed(@NonNull MotionEvent e) {
                    Pair<Integer, Integer> cursorPair = Pair.create(-1, -1);
                    cursorCache.put(node, cursorPair);
                    Spannable spannable = (Spannable) holder.textView.getText();

                    BackgroundColorSpan[] spans = spannable.getSpans(0, holder.textView.length(), BackgroundColorSpan.class);
                    for (BackgroundColorSpan span : spans) {
                        spannable.removeSpan(span);
                    }
                    return super.onSingleTapConfirmed(e);
                }
            });
            holder.textView.setOnTouchListener((v, event) -> gd.onTouchEvent(event));
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private int dp2px(Context context,Float dpValue )  {
        DisplayMetrics metrics = context.getResources().getDisplayMetrics();
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dpValue, metrics);
    }

    //    private UITextMessage mData;
    private int position;

    public static class Holder extends MarkwonAdapter.Holder {
        final TextView textView;

        protected Holder(@IdRes int textViewIdRes, @NonNull View itemView) {
            super(itemView);
            final TextView textView;
            if (textViewIdRes == 0) {
                if (!(itemView instanceof TextView)) {
                    throw new IllegalStateException("TextView is not root of layout " +
                            "(specify TextView ID explicitly): " + itemView);
                }
                textView = (TextView) itemView;
                textView.setTextColor(Color.BLACK);
            } else {
                textView = requireView(textViewIdRes);
            }
            this.textView = textView;
            this.textView.setSpannableFactory(NoCopySpannableFactory.getInstance());
            


            this.textView.setBreakStrategy(LineBreaker.BREAK_STRATEGY_HIGH_QUALITY); // 2 = BREAK_STRATEGY_HIGH_QUALITY
        }
    }

    private NotTableContentTouchCallback touchCallback;

    public void setTouchCallback(NotTableContentTouchCallback touchCallback) {
        this.touchCallback = touchCallback;
    }

    public interface NotTableContentTouchCallback {
        void onLongPress(Node node, View view, MotionEvent motionEvent, int position);
    }
}
