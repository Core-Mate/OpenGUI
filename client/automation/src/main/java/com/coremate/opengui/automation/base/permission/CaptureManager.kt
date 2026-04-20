package com.coremate.opengui.automation.base.permission

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import com.coremate.opengui.automation.base.utils.AMScreenUtils

//截屏管理
class CaptureManager {

    companion object {

        const val REQUEST_CODE = 10000

        @JvmStatic
        val instance by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            CaptureManager()
        }
    }

    var isOpenPermission = false

    private var mImageReader: ImageReader? = null
    private var mVirtualDisplay: VirtualDisplay? = null
    private var mMediaProjection: MediaProjection? = null
    private var mMediaProjectionManager: MediaProjectionManager? = null

    /**
     * 开启截屏权限
     */
    fun openCapture(context: Activity?) {
        if (isOpenPermission) return
        mMediaProjectionManager =
            context?.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        var intent: Intent? = null
        intent = mMediaProjectionManager?.createScreenCaptureIntent()
        context.startActivityForResult(intent, REQUEST_CODE)
    }

    /**
     * 获取媒体
     * */
    @SuppressLint("WrongConstant")
    fun setMediaProjection(resultCode: Int, data: Intent?) {
        if (mMediaProjection == null && data != null) {
            isOpenPermission = true
            mMediaProjection = mMediaProjectionManager?.getMediaProjection(resultCode, data)
        }
    }

    /**
     * 截图
     * */
    fun startTask(listener: CaptureManagerListener?) {
        synchronized(this) {
            if (mVirtualDisplay == null && mMediaProjection != null) {
                mImageReader = ImageReader.newInstance(
                    AMScreenUtils.screenWidth(),
                    AMScreenUtils.screenHeight(),
                    PixelFormat.RGBA_8888.toInt(),
                    4
                ) //ImageFormat.RGB_565
                mVirtualDisplay = mMediaProjection?.createVirtualDisplay(
                    "Shooters",
                    AMScreenUtils.screenWidth(),
                    AMScreenUtils.screenHeight(),
                    Resources.getSystem().displayMetrics.densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    mImageReader?.surface,
                    null,
                    null
                )
                mImageReader?.setOnImageAvailableListener({
                    if (mImageReader != null && mMediaProjection != null && mVirtualDisplay != null) {
                        val image = mImageReader?.acquireLatestImage()
                        if (image != null) {
                            val width = image.width
                            val height = image.height
                            val planes = image.planes
                            val buffer = planes[0].buffer
                            val pixelStride = planes[0].pixelStride
                            val rowStride = planes[0].rowStride
                            val rowPadding = rowStride - pixelStride * width
                            val createBitMap = Bitmap.createBitmap(
                                width + rowPadding / pixelStride,
                                height,
                                Bitmap.Config.ARGB_8888
                            )
                            createBitMap.copyPixelsFromBuffer(buffer)
                            // 创建 Bitmap 对象
                            val bitmap = createBitMap.copy(Bitmap.Config.ARGB_8888, true)
                            image.close()
                            listener?.onScreenBitmap(bitmap)
                            mVirtualDisplay?.release()
                            mVirtualDisplay = null
                        }
                    }
                }, null)
            }
        }
    }

    interface CaptureManagerListener {
        fun onScreenBitmap(bitmap: Bitmap)
    }

}