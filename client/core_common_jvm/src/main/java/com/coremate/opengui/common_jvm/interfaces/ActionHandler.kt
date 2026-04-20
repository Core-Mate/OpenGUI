package com.coremate.opengui.common_jvm.interfaces

import com.coremate.opengui.common_jvm.dto.ActionInputs

/**
 * An interface for handling automated actions.
 * This allows the network layer to request actions without knowing their concrete implementation.
 */
interface ActionHandler {
    /**
     * Executes an accessibility action based on the provided action type and inputs.
     *
     * @param actionType The type of action to perform (e.g., "click", "long_press", "open_app").
     * @param inputs The input parameters for the action.
     * @return True if the action was successfully initiated, false otherwise.
     */
    suspend fun executeAction(actionType: String, inputs: ActionInputs): Boolean

    /**
     * Captures a screenshot and returns its URL/Base64 string.
     * This method is part of the ActionHandler as screenshot capture is often
     * a direct consequence or requirement of performing an action.
     * @return A URL string or Base64 encoded image string, or null if capture fails.
     */
    suspend fun captureScreenshot(): Map<String, Any?>?
}