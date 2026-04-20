package com.coremate.opengui.accessibility.actions

import com.coremate.opengui.accessibility.GestureService

/**
 * A class that encapsulates the logic for performing a "back" system action.
 */
class PressBackAction {

    /**
     * Requests the GestureService to perform a global back action,
     * simulating a press of the system's back button.
     *
     * @return True if the back action was successfully performed, false otherwise.
     */
    fun perform(): Boolean {
        return GestureService.instance?.performGlobalBack() ?: false
    }
}