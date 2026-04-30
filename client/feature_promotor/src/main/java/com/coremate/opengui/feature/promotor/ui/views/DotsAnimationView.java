package com.coremate.opengui.feature.promotor.ui.views;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Handler;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.View;

public class DotsAnimationView extends View {
    private static final int LIGHT_COLOR = 0x66000000; // #00000066
    private static final int DARK_COLOR = 0xCC000000;  // #000000CC
    private static final int DOT_DIAMETER_DP = 6;
    private static final int DOT_SPACING_DP = 4;
    private static final int ANIMATION_DELAY_MS = 300;

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Handler handler = new Handler();
    private int activeDot = 0;
    private boolean isAnimating = false;

    private final Runnable animationRunnable = new Runnable() {
        @Override
        public void run() {
            activeDot = (activeDot + 1) % 3;
            invalidate();
            if (isAnimating) {
                handler.postDelayed(this, ANIMATION_DELAY_MS);
            }
        }
    };

    public DotsAnimationView(Context context) {
        super(context);
        init();
    }

    public DotsAnimationView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    public DotsAnimationView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        init();
    }

    private void init() {
        paint.setStyle(Paint.Style.FILL);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        float dotRadius = dpToPx(DOT_DIAMETER_DP) / 2f;
        float spacing = dpToPx(DOT_SPACING_DP);
        float totalWidth = dpToPx(DOT_DIAMETER_DP) * 3 + spacing * 2;


        float startX = (getWidth() - totalWidth) / 2 + dotRadius;
        float centerY = getHeight() / 2f;

        for (int i = 0; i < 3; i++) {
            if (i == activeDot) {
                paint.setColor(LIGHT_COLOR);
            } else {
                paint.setColor(DARK_COLOR);
            }

            float cx = startX + i * (dotRadius * 2 + spacing);
            canvas.drawCircle(cx, centerY, dotRadius, paint);
        }
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int desiredWidth = (int) (dpToPx(DOT_DIAMETER_DP) * 3 + dpToPx(DOT_SPACING_DP) * 2);
        int desiredHeight = (int) dpToPx(DOT_DIAMETER_DP);

        setMeasuredDimension(
                resolveSize(desiredWidth, widthMeasureSpec),
                resolveSize(desiredHeight, heightMeasureSpec)
        );
    }

    public void startAnimation() {
        if (!isAnimating) {
            isAnimating = true;
            handler.postDelayed(animationRunnable, ANIMATION_DELAY_MS);
        }
    }

    public void stopAnimation() {
        isAnimating = false;
        handler.removeCallbacks(animationRunnable);
    }

    private float dpToPx(int dp) {
        return TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                dp,
                getResources().getDisplayMetrics()
        );
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        startAnimation();
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        stopAnimation();
    }
}