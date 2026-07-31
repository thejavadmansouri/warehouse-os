package com.warehouseos.operator.data.speech

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * [SpeechToTextProvider] backed by Android's [SpeechRecognizer] (Epic 6).
 *
 * Note: on most devices fa-IR recognition is Google's cloud engine, so this
 * adapter is effectively online. That's an accepted Epic-6 bootstrap — an offline
 * Vosk adapter will implement the same interface later. The engine is created and
 * driven on the collector's thread, which must be the main thread (the ViewModel
 * collects in viewModelScope, i.e. Dispatchers.Main).
 */
@Singleton
class AndroidSttProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) : SpeechToTextProvider {

    override val capabilities = SttCapabilities(
        worksOffline = false,
        emitsPartials = true,
        biasable = false,
    )

    // Reused across utterances: creating/binding the recognition service is the
    // slow part, so we create it once (on the main thread) and keep it warm rather
    // than create/destroy per tap. Never touched off the main thread.
    private var recognizer: SpeechRecognizer? = null

    private fun ensureRecognizer(): SpeechRecognizer? {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) return null
        return recognizer ?: SpeechRecognizer.createSpeechRecognizer(context).also { recognizer = it }
    }

    /** Pre-bind the engine when the voice screen opens so the first tap is instant. */
    override fun prewarm() {
        runCatching { ensureRecognizer() }
    }

    override fun transcribe(config: SttConfig): Flow<SttEvent> = callbackFlow {
        val recognizer = ensureRecognizer()
        if (recognizer == null) {
            trySend(SttEvent.Error(SttError.UNAVAILABLE))
            close()
            return@callbackFlow
        }

        val listener = object : RecognitionListener {
            override fun onPartialResults(partialResults: Bundle) {
                firstResult(partialResults)?.let { trySend(SttEvent.Partial(it)) }
            }

            override fun onResults(results: Bundle) {
                trySend(SttEvent.Final(firstResult(results).orEmpty()))
                close()
            }

            override fun onError(error: Int) {
                trySend(SttEvent.Error(mapError(error)))
                close()
            }

            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        }
        recognizer.setRecognitionListener(listener)

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, config.languageTag)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            if (config.preferOffline) {
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            }
        }
        recognizer.startListening(intent)

        awaitClose {
            // Cancel (not destroy) so the engine stays warm for the next utterance.
            runCatching { recognizer.cancel() }
        }
    }

    private fun firstResult(bundle: Bundle): String? =
        bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()

    private fun mapError(error: Int): SttError = when (error) {
        SpeechRecognizer.ERROR_NETWORK,
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
        SpeechRecognizer.ERROR_SERVER,
        -> SttError.NO_NETWORK

        SpeechRecognizer.ERROR_NO_MATCH,
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
        -> SttError.NO_SPEECH

        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> SttError.NO_PERMISSION

        else -> SttError.ENGINE_FAILURE
    }
}
