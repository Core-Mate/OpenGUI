package com.coremate.opengui.accessibility.actions

import com.coremate.opengui.accessibility.GestureService

/**
 * A class that encapsulates the logic for performing a scroll action.
 */
class ScrollAction {

    companion object {
        // A reasonable default duration for a scroll gesture.
        private const val DEFAULT_SCROLL_DURATION = 500L // 500ms, slightly longer for a noticeable scroll
        // Default scroll distance. This might need adjustment based on typical screen sizes.
        private const val DEFAULT_SCROLL_DISTANCE = 300f // pixels
    }

    /**
     * Defines the possible directions for a scroll gesture.
     */
    enum class ScrollDirection {
        UP,
        DOWN,
        LEFT,
        RIGHT
    }

    /**
     * Requests the GestureService to perform a scroll gesture.
     *
     * @param startX The starting x-coordinate of the scroll.
     * @param startY The starting y-coordinate of the scroll.
     * @param direction The direction of the scroll (UP, DOWN, LEFT, RIGHT).
     * @param distance The distance to scroll in pixels.
     * @param duration The duration of the scroll in milliseconds.
     */
    fun perform(
        startX: Float,
        startY: Float,
        direction: ScrollDirection,
        distance: Float = DEFAULT_SCROLL_DISTANCE,
        duration: Long = DEFAULT_SCROLL_DURATION
    ):Boolean {
        val endX: Float
        val endY: Float

        when (direction) {
            ScrollDirection.UP -> {
                endX = startX
                endY = startY - distance
            }
            ScrollDirection.DOWN -> {
                endX = startX
                endY = startY + distance
            }
            ScrollDirection.LEFT -> {
                endX = startX + distance
                endY = startY
            }
            ScrollDirection.RIGHT -> {
                endX = startX - distance
                endY = startY
            }
        }

        return GestureService.instance?.performSwipe(startX, startY, endX, endY, duration)?:false
    }
}