package com.coremate.opengui.aop.utils

import com.coremate.opengui.common_jvm.utils.Logger

class ConsoleLogger : Logger {
    override fun debug(tag: String, message: String) {
        println("DEBUG/$tag: $message")
    }

    override fun info(tag: String, message: String) {
        println("INFO/$tag: $message")
    }

    override fun warn(tag: String, message: String) {
        System.err.println("WARN/$tag: $message") // Warnings and errors usually go to stderr.
    }

    override fun error(tag: String, message: String, throwable: Throwable?) {
        System.err.println("ERROR/$tag: $message")
        throwable?.printStackTrace(System.err)
    }
}
