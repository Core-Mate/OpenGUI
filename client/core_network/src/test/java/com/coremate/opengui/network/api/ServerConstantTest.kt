package com.coremate.opengui.network.api

import com.tencent.mmkv.MMKV
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mockito.Mockito

class ServerConstantTest {
    // MMKV uses Android native storage, unavailable in local JVM tests.
    @Test
    fun savedBackendAddressIsUsed() {
        val storage = Mockito.mock(MMKV::class.java)
        Mockito.`when`(storage.getString("BaseUrl", null)).thenReturn("http://192.168.1.42:7777")
        Mockito.mockStatic(MMKV::class.java).use { mmkv ->
            mmkv.`when`<MMKV> { MMKV.mmkvWithID("BaseUrl") }.thenReturn(storage)
            assertEquals("http://192.168.1.42:7777", ServerConstant.getURL())
        }
    }

    @Test
    fun missingBackendAddressUsesLocalPortForwarding() {
        val storage = Mockito.mock(MMKV::class.java)
        Mockito.mockStatic(MMKV::class.java).use { mmkv ->
            mmkv.`when`<MMKV> { MMKV.mmkvWithID("BaseUrl") }.thenReturn(storage)
            assertEquals("http://127.0.0.1:7777", ServerConstant.getURL())
        }
    }
}
