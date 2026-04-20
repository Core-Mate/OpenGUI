package com.coremate.opengui.accessibility.actions

import com.coremate.opengui.accessibility.GestureService

/**
 * A class that encapsulates the logic for performing a text input (type) action.
 */
class TypeAction {

    /**
     * Requests the GestureService to perform a text input action.
     * This will attempt to type the given content into the currently focused editable field.
     *
     * @param content The text content to be typed.
     * @return True if the text input was successfully initiated, false otherwise.
     */
    fun perform(content: String): Boolean {
        return GestureService.instance?.performTypeText(content) ?: false
    }
}