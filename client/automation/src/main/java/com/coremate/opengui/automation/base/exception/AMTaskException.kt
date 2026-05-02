package com.coremate.opengui.automation.base.exception

///Failure reason
enum class AMTaskErrorReason(val text: String) {
    //Pause
    PAUSE("PAUSE"),

    //Normal stop
    STOP("STOP"),

    //Crash
    CRASH("CRASH"),

    //Business exception
    BUSINESS("BUSINESS"),

    //Service interruption
    INTERRUPT("INTERRUPT")
}

///Exception
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