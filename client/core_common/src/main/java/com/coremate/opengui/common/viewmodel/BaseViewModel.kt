package com.coremate.opengui.common.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coremate.opengui.common.state.UiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * A base ViewModel that standardizes state management using UiState and StateFlow.
 * @param T The type of the data held in the UiState.
 */
abstract class BaseViewModel<T> : ViewModel() {

    // A protected, mutable state flow that can only be updated from within the ViewModel.
    protected val _uiState = MutableStateFlow<UiState<T>>(UiState.Idle)

    // A public, read-only state flow that the UI can observe for state changes.
    val uiState = _uiState.asStateFlow()

    /**
     * A helper function to execute a suspend function and update the UI state accordingly.
     * It handles setting Loading and Error states automatically.
     *
     * @param block The suspend function that returns the data of type T.
     */
    protected fun execute(block: suspend () -> T) {
        viewModelScope.launch {
            // Set state to Loading before execution
            _uiState.value = UiState.Loading
            try {
                // Execute the block and set state to Success with the result
                val result = block()
                _uiState.value = UiState.Success(result)
            } catch (e: Exception) {
                // Set state to Error if an exception occurs
                _uiState.value = UiState.Error(e.message ?: "An unknown error occurred")
            }
        }
    }
}