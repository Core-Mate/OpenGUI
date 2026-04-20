package com.coremate.opengui.accessibility.actions

import com.coremate.opengui.accessibility.GestureService

/**
 * A class that encapsulates the logic for performing a drag action.
 */
class DragAction {

    companion object {
        // A reasonable default duration for a drag gesture.
        private const val DEFAULT_DRAG_DURATION = 800L // 800ms, typically longer for a drag
    }

    /**
     * Requests the GestureService to perform a drag gesture.
     *
     * @param startX The starting x-coordinate of the drag.
     * @param startY The starting y-coordinate of the drag.
     * @param endX The ending x-coordinate of the drag.
     * @param endY The ending y-coordinate of the drag.
     * @param duration The duration of the drag in milliseconds.
     */
    fun perform(
        startX: Float,
        startY: Float,
        endX: Float,
        endY: Float,
        duration: Long = DEFAULT_DRAG_DURATION
    ) : Boolean {
        return GestureService.instance?.performSwipe(startX, startY, endX, endY, duration) ?: false
    }
}