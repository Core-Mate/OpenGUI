package com.coremate.opengui.accessibility.actions

/**
 * A class that represents the completion of an automated task or process.
 * It carries a message indicating the outcome or information about the completion.
 * This action does not perform any UI gesture but serves as a status indicator.
 */
class FinishedAction {

    /**
     * Reports the completion of a task with a given message.
     * This method is intended to be called when an automated sequence has finished,
     * providing a final status or descriptive message.
     *
     * @param message The message describing the completion status or outcome.
     */
    fun reportCompletion(message: String) {
        // In a real application, you might:
        // 1. Log this message:
        println("Task Finished: $message")
        // 2. Broadcast an intent to other parts of the app:
        // intent.putExtra("message", message)
        // context.sendBroadcast(intent)
        // 3. Update a ViewModel or LiveData to notify UI:
        // someViewModel.updateTaskStatus("Completed: $message")
        // 4. Show a Toast or notification to the user (though typically this would be handled by a UI layer observing task status)
    }
}