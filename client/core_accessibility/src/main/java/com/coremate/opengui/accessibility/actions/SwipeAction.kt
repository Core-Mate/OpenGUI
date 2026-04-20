package com.coremate.opengui.accessibility.actions

import com.coremate.opengui.accessibility.GestureService

/**
 * A class that encapsulates the logic for performing a swipe action.
 */
class SwipeAction {

    companion object {
        // A reasonable default duration for a swipe gesture.
        private const val DEFAULT_SWIPE_DURATION = 300L // 300ms
    }

    /**
     * Requests the GestureService to perform a swipe gesture.
     *
     * @param startX The starting x-coordinate.
     * @param startY The starting y-coordinate.
     * @param endX The ending x-coordinate.
     * @param endY The ending y-coordinate.
     * @param duration The duration of the swipe in milliseconds.
     */
    fun perform(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        duration: Long = DEFAULT_SWIPE_DURATION
    ): Boolean {
        return GestureService.instance?.performSwipe(startX, startY, endX, endY, duration)?:false
    }
}