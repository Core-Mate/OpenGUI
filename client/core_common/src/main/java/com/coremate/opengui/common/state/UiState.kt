package com.coremate.opengui.common.state

/**
 * A generic sealed interface to represent UI states.
 * It ensures that the UI can only be in one of these well-defined states at a time.
 * @param T The type of the data to be held in the Success state.
 */
sealed interface UiState<out T> {
    /**
     * Represents an idle or initial state before any data is loaded.
     */
    data object Idle : UiState<Nothing>

    /**
     * Represents a loading state, typically when data is being fetched.
     */
    data object Loading : UiState<Nothing>

    /**
     * Represents a successful state where data has been loaded.
     * @param data The successfully loaded data.
     */
    data class Success<T>(val data: T) : UiState<T>

    /**
     * Represents an error state.
     * @param message A user-friendly error message.
     */
    data class Error(val message: String) : UiState<Nothing>
}