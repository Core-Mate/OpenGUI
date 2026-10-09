package com.coremate.opengui.feature.promotor

import android.content.Context
import android.provider.Settings
import com.coremate.opengui.accessibility.GestureService
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [30])
class PermissionManagerTest {
    private val context: Context = RuntimeEnvironment.getApplication()

    private fun connect(service: GestureService) {
        GestureService::class.java.getDeclaredMethod("onServiceConnected").apply {
            isAccessible = true
        }.invoke(service)
    }

    @After
    fun clearInstance() {
        GestureService.instance = null
    }

    private fun enableService() {
        Settings.Secure.putString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            "${context.packageName}/${GestureService::class.java.canonicalName}"
        )
    }

    @Test
    fun enabledButUnboundServiceIsNotReady() {
        enableService()
        assertFalse(PermissionManager.isAccessibilityServiceEnabled(context))
    }

    @Test
    fun enabledAndConnectedServiceIsReady() {
        enableService()
        val service = Robolectric.buildService(GestureService::class.java).create().get()
        connect(service)
        assertTrue(PermissionManager.isAccessibilityServiceEnabled(context))
    }

    @Test
    fun unboundServiceIsNotReadyEvenIfSettingsStillEnableIt() {
        enableService()
        val service = Robolectric.buildService(GestureService::class.java).create().get()
        connect(service)
        service.onUnbind(null)
        assertFalse(PermissionManager.isAccessibilityServiceEnabled(context))
    }

    @Test
    fun connectedServiceIsNotReadyWhenSettingsDisableIt() {
        val service = Robolectric.buildService(GestureService::class.java).create().get()
        connect(service)
        Settings.Secure.putString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, "")
        assertFalse(PermissionManager.isAccessibilityServiceEnabled(context))
    }
}
