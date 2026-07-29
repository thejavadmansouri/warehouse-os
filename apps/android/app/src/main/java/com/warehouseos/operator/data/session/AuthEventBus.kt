package com.warehouseos.operator.data.session

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * App-wide bus for auth events the networking layer detects but can't act on.
 * The 401 interceptor emits [AuthEvent.Unauthorized]; the app shell (Epic 3)
 * observes it to clear the session and route back to Login from anywhere.
 */
@Singleton
class AuthEventBus @Inject constructor() {

    private val _events = MutableSharedFlow<AuthEvent>(
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<AuthEvent> = _events.asSharedFlow()

    fun emit(event: AuthEvent) {
        _events.tryEmit(event)
    }
}

sealed interface AuthEvent {
    /** A request came back 401 — token is missing or expired. */
    data object Unauthorized : AuthEvent
}
