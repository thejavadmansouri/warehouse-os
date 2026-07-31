package com.warehouseos.operator.data.speech

import kotlinx.coroutines.flow.Flow

/**
 * Speech-to-text abstraction (Epic 6). The app depends only on this interface;
 * the engine (Android SpeechRecognizer now, Vosk offline / server Whisper later)
 * is a swappable adapter chosen via DI. Deliberately covers ONLY audio → text —
 * parsing/extraction and matching stay on the backend.
 */
interface SpeechToTextProvider {

    val capabilities: SttCapabilities

    /**
     * Optional warm-up: pre-create/bind the engine so the first [transcribe] starts
     * listening immediately. Safe to call repeatedly; must be called on the main
     * thread. No-op by default.
     */
    fun prewarm() {}

    /**
     * Starts one push-to-talk recognition and emits [SttEvent]s until a final
     * result or error. Cancelling the collecting coroutine stops recognition and
     * releases the engine.
     */
    fun transcribe(config: SttConfig = SttConfig()): Flow<SttEvent>
}

data class SttCapabilities(
    val worksOffline: Boolean,
    val emitsPartials: Boolean,
    val biasable: Boolean,
)

data class SttConfig(
    val languageTag: String = "fa-IR",
    val preferOffline: Boolean = false,
)

sealed interface SttEvent {
    /** Live in-progress transcript; may fire several times. */
    data class Partial(val text: String) : SttEvent

    /** Final transcript for this utterance; terminal. */
    data class Final(val text: String) : SttEvent

    /** Recognition failed; terminal. */
    data class Error(val kind: SttError, val message: String? = null) : SttEvent
}

enum class SttError {
    NO_PERMISSION,
    NO_NETWORK,
    NO_SPEECH,
    ENGINE_FAILURE,
    UNAVAILABLE,
}
