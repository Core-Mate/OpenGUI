package com.coremate.opengui.accessibility

import org.junit.After
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [30])
class GestureServiceLifecycleTest {
    private fun connect(service: GestureService) {
        GestureService::class.java.getDeclaredMethod("onServiceConnected").apply {
            isAccessible = true
        }.invoke(service)
    }

    @After
    fun clearInstance() {
        GestureService.instance = null
    }

    @Test
    fun unbindingClearsTheConnectedService() {
        val service = Robolectric.buildService(GestureService::class.java).create().get()
        connect(service)
        service.onUnbind(null)
        assertNull(GestureService.instance)
    }

    @Test
    fun destroyingClearsTheConnectedService() {
        val controller = Robolectric.buildService(GestureService::class.java).create()
        connect(controller.get())
        controller.destroy()
        assertNull(GestureService.instance)
    }

    @Test
    fun oldServiceUnbindingDoesNotClearAReplacement() {
        val oldService = Robolectric.buildService(GestureService::class.java).create().get()
        val replacement = Robolectric.buildService(GestureService::class.java).create().get()
        connect(oldService)
        connect(replacement)
        oldService.onUnbind(null)
        assertSame(replacement, GestureService.instance)
    }

    @Test
    fun oldServiceDestructionDoesNotClearAReplacement() {
        val oldController = Robolectric.buildService(GestureService::class.java).create()
        val replacement = Robolectric.buildService(GestureService::class.java).create().get()
        connect(oldController.get())
        connect(replacement)
        oldController.destroy()
        assertSame(replacement, GestureService.instance)
    }
}
