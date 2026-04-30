package com.coremate.opengui.login.login.view;

import android.content.Context;
import android.content.res.TypedArray;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.InputFilter;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.method.HideReturnsTransformationMethod;
import android.text.method.PasswordTransformationMethod;
import android.util.AttributeSet;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RelativeLayout;
import android.widget.TextView;

import androidx.annotation.IntDef;

import com.coremate.opengui.R;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

public class InputCodeLayout extends RelativeLayout implements TextWatcher, View.OnKeyListener {

    @IntDef({NORMAL, PASSWORD})
    @Retention(RetentionPolicy.SOURCE)
    @interface ShowMode {}

    public static final int NORMAL = 0;
    public static final int PASSWORD = 1;

    private final Context mContext;

    private int mNumber;
    private int mWidth;
    private int mHeight;
    private int mDivideWidth;
    private int mTextColor;
    private int mTextSize;
    private int mFocusBackground;
    private int mUnFocusBackground;
    private int mErrorBackground;
    private boolean mIsErrorState;
    private int mShowMode;

    private LinearLayout mContainer;
    private TextView[] mTextViews;
    private EditText mEdtCode;

    public EditText getEdtCode() {
        return mEdtCode;
    }

    public InputCodeLayout(Context context) {
        this(context, null);
    }

    public InputCodeLayout(Context context, AttributeSet attrs) {
        this(context, attrs, 0);
    }

    public InputCodeLayout(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        mContext = context;
        initViews();
        initAttrs(attrs);
        initListener();
    }

    private void initAttrs(AttributeSet attrs) {
        TypedArray a = mContext.obtainStyledAttributes(attrs, R.styleable.InputCodeLayout);
        mNumber = a.getInt(R.styleable.InputCodeLayout_icl_number, -1);
        mWidth = a.getDimensionPixelSize(R.styleable.InputCodeLayout_icl_width, -1);
        mHeight = a.getDimensionPixelSize(R.styleable.InputCodeLayout_icl_height, -1);
        int divideWidth = a.getDimensionPixelSize(R.styleable.InputCodeLayout_icl_divideWidth, -1);
        if(divideWidth != -1) setDivideWidth(divideWidth);
        mTextColor = a.getColor(R.styleable.InputCodeLayout_icl_textColor, -1);
        mTextSize = a.getDimensionPixelSize(R.styleable.InputCodeLayout_icl_textSize, 14);
        mFocusBackground = a.getResourceId(R.styleable.InputCodeLayout_icl_focusBackground, -1);
        mUnFocusBackground = a.getResourceId(R.styleable.InputCodeLayout_icl_unFocusBackground, -1);
        mErrorBackground = a.getResourceId(R.styleable.InputCodeLayout_icl_errorBackground, -1);
        mShowMode = a.getInt(R.styleable.InputCodeLayout_icl_showMode, NORMAL);
        int gravity = a.getInt(R.styleable.InputCodeLayout_android_gravity, -1);
        if(gravity != -1) setGravity(gravity);
        a.recycle();
    }

    private void initViews() {
        LayoutParams params = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
        mContainer = new LinearLayout(mContext);
        mContainer.setLayoutParams(params);
        mContainer.setOrientation(LinearLayout.HORIZONTAL);
        mContainer.setShowDividers(LinearLayout.SHOW_DIVIDER_MIDDLE);
        addView(mContainer);

        mEdtCode = new EditText(mContext);
        mEdtCode.setLayoutParams(params);

        mEdtCode.setFocusable(true);
        mEdtCode.setFocusableInTouchMode(true);
        mEdtCode.setCursorVisible(false);

        mEdtCode.setInputType(EditorInfo.TYPE_CLASS_NUMBER);
        mEdtCode.setBackgroundResource(android.R.color.transparent);
        addView(mEdtCode);
        if (mEdtCode != null) {

            mEdtCode.post(new Runnable() {
                @Override
                public void run() {
                    mEdtCode.requestFocus();
                }
            });
        }
    }

    private void initListener() {
        mEdtCode.addTextChangedListener(this);
        mEdtCode.setOnKeyListener(this);
    }

    @Override
    public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

    @Override
    public void onTextChanged(CharSequence s, int start, int before, int count) {}

    @Override
    public void afterTextChanged(Editable s) {
        String input = s.toString();
        if (TextUtils.isEmpty(input)) return;


        String cleanInput = input.replaceAll("[^0-9]", "");
        if (TextUtils.isEmpty(cleanInput)) {
            mEdtCode.removeTextChangedListener(this);
            mEdtCode.setText("");
            mEdtCode.addTextChangedListener(this);
            return;
        }


        mEdtCode.removeTextChangedListener(this);


        fillCodes(cleanInput);


        mEdtCode.setText("");
        mEdtCode.addTextChangedListener(this);
    }

    /**
     */
    private void fillCodes(String input) {
        if (mTextViews == null) return;

        char[] chars = input.toCharArray();
        for (char c : chars) {
            for (int i = 0; i < mTextViews.length; i++) {
                TextView textView = mTextViews[i];

                if (TextUtils.isEmpty(textView.getText().toString())) {
                    textView.setText(String.valueOf(c));
                    textView.setBackgroundResource(mUnFocusBackground);

                    if (i < mTextViews.length - 1) {
                        mTextViews[i + 1].setBackgroundResource(mFocusBackground);
                    }


                    if (i == mTextViews.length - 1 && mOnInputCompleteCallback != null) {
                        mOnInputCompleteCallback.onInputCompleteListener(getCode());
                    }

                    break;
                }
            }
        }
    }

    @Override
    public boolean onKey(View v, int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_DEL && event.getAction() == KeyEvent.ACTION_DOWN) {
            deleteCode();
            return true;
        }
        return false;
    }

    /**
     */
    private void deleteCode() {
        if (mTextViews == null) return;
        for (int i = mTextViews.length - 1; i >= 0; i--) {
            TextView textView = mTextViews[i];
            if (!TextUtils.isEmpty(textView.getText().toString())) {
                textView.setText("");
                textView.setBackgroundResource(mFocusBackground);

                if (i < mTextViews.length - 1) {
                    mTextViews[i + 1].setBackgroundResource(mUnFocusBackground);
                }
                break;
            }
        }
    }

    @Override
    protected void onFinishInflate() {
        super.onFinishInflate();
        mContainer.post(this::initTextView);
    }

    private void initTextView() {
        if(mNumber <= 0) return;

        int measuredWidth = mContainer.getMeasuredWidth();
        int height = (measuredWidth - (mDivideWidth * (mNumber - 1))) / mNumber;

        mTextViews = new TextView[mNumber];
        mContainer.removeAllViews();
        for (int i = 0; i < mNumber; i++) {
            final TextView textView = new TextView(mContext);

            if (mWidth != -1 && mHeight != -1) {
                textView.setWidth(mWidth);
                textView.setHeight(mHeight);
            } else {
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, height, 1);
                textView.setLayoutParams(lp);
            }

            if (mTextSize != -1)
                textView.getPaint().setTextSize(mTextSize);
            if (mTextColor != -1)
                textView.setTextColor(mTextColor);
            if (mFocusBackground != -1 && mUnFocusBackground != -1)
                textView.setBackgroundResource(i != 0 ? mUnFocusBackground : mFocusBackground);

            textView.setGravity(Gravity.CENTER);
            textView.setFocusable(false);
            setShowMode(textView);
            mTextViews[i] = textView;
            mContainer.addView(textView);
        }

        mContainer.post(() -> mEdtCode.setHeight(mContainer.getMeasuredHeight()));
    }

    public void setNumber(int number){
        if(mNumber != number){
            mNumber = number;
            mEdtCode.setFilters(new InputFilter[]{new InputFilter.LengthFilter(mNumber)});
            onFinishInflate();
        }
    }

    public void setDivideWidth(int width){
        if(width != mDivideWidth){
            mDivideWidth = width;
            mContainer.setDividerDrawable(createDivideShape(mDivideWidth));
        }
    }

    private Drawable createDivideShape(int width) {
        GradientDrawable shape = new GradientDrawable();
        shape.setSize(width, 0);
        return shape;
    }

    public void setWidth(int width){
        if(mWidth != width){
            mWidth = width;
            onFinishInflate();
        }
    }

    public void setHeight(int height){
        if(mHeight != height){
            mHeight = height;
            onFinishInflate();
        }
    }

    public void setShowMode(@ShowMode int showMode) {
        if (mShowMode != showMode) {
            mShowMode = showMode;
            if (mTextViews != null) {
                for (TextView textView : mTextViews) {
                    setShowMode(textView);
                }
            }
        }
    }

    private void setShowMode(TextView textView){
        if (mShowMode == NORMAL)
            textView.setTransformationMethod(HideReturnsTransformationMethod.getInstance());
        else
            textView.setTransformationMethod(PasswordTransformationMethod.getInstance());
    }

    public void setGravity(int gravity) {
        if(mContainer != null)
            mContainer.setGravity(gravity);
    }

    public void setErrorState(boolean error) {
        if (mIsErrorState == error) return;
        mIsErrorState = error;
        if (mTextViews == null) return;
        if (mIsErrorState && mErrorBackground != -1) {
            for (TextView textView : mTextViews) {
                textView.setBackgroundResource(mErrorBackground);
            }
        } else {
            for (int i = 0; i < mTextViews.length; i++) {
                mTextViews[i].setBackgroundResource(i != 0 ? mUnFocusBackground : mFocusBackground);
            }
        }
    }

    public String getCode() {
        if (mTextViews == null) return "";
        StringBuilder sb = new StringBuilder();
        for (TextView textView : mTextViews) {
            sb.append(textView.getText().toString());
        }
        return sb.toString();
    }

    public void clear() {
        if (mTextViews == null) return;
        mIsErrorState = false;
        for (int i = 0; i < mTextViews.length; i++) {
            TextView textView = mTextViews[i];
            textView.setText("");
            textView.setBackgroundResource(i != 0 ? mUnFocusBackground : mFocusBackground);
        }
    }

    private OnInputCompleteCallback mOnInputCompleteCallback;

    public interface OnInputCompleteCallback {
        void onInputCompleteListener(String code);
    }

    public void setOnInputCompleteListener(OnInputCompleteCallback callback) {
        this.mOnInputCompleteCallback = callback;
    }
}