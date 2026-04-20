package com.coremate.opengui.accessibility.actions

import com.coremate.opengui.accessibility.GestureService

/**
 * A class that encapsulates the logic for performing a "home" system action.
 */
class PressHomeAction {

    /**
     * Requests the GestureService to perform a global home action,
     * simulating a press of the system's home button.
     *
     * @return True if the home action was successfully performed, false otherwise.
     */
    fun perform(): Boolean {
        return GestureService.instance?.performGlobalHome() ?: false
    }
}