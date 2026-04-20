package com.coremate.opengui.automation.base.exception

///失败原因
enum class AMTaskErrorReason(val text: String) {
    //暂停
    PAUSE("PAUSE"),

    //正常 停止
    STOP("STOP"),

    //崩溃
    CRASH("CRASH"),

    //业务异常
    BUSINESS("BUSINESS"),

    //服务中断
    INTERRUPT("INTERRUPT")
}

///异常
class AMTaskException private constructor(
    val reason: AMTaskErrorReason,
    override val cause: Throwable? = null,
) : Exception(cause) {

    companion object {
        fun pause() = AMTaskException(AMTaskErrorReason.PAUSE)
        fun stop() = AMTaskException(AMTaskErrorReason.STOP)
        fun crash(cause: Throwable?) = AMTaskException(AMTaskErrorReason.CRASH, cause)
        fun business(msg: String) =
            AMTaskException(AMTaskErrorReason.BUSINESS, Throwable(msg))
        fun interrupt() = AMTaskException(AMTaskErrorReason.INTERRUPT)
    }

}