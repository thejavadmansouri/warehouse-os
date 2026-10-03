package com.warehouseos.operator.ui.components

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.media.AudioManager
import android.media.ToneGenerator
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * Keeps the screen awake for as long as the calling screen is on display.
 *
 * Warehouse work is hands-full work: the operator is holding a box while the
 * phone sits in a holster or on a shelf, and the default screen timeout makes
 * them unlock again — with gloves — several times per aisle. Scoped to the
 * composable rather than set globally so idle screens (login, settings) still
 * let the device sleep normally.
 */
@Composable
fun KeepScreenOn() {
    val context = LocalContext.current
    DisposableEffect(context) {
        val window = context.findActivity()?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/**
 * Short audible confirm/error tones.
 *
 * Haptics alone are not enough on a warehouse floor: the phone is often not in
 * the operator's hand, and a scan that silently failed costs far more than the
 * beep does. Uses the alarm stream so it stays audible when the ringer is down.
 */
class OperatorTones {
    private val tone: ToneGenerator? = runCatching {
        ToneGenerator(AudioManager.STREAM_ALARM, 80)
    }.getOrNull()

    /** Single short blip — a scan was read, or an entry was accepted. */
    fun success() {
        runCatching { tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 150) }
    }

    /** Lower double blip — nothing was found, or the server rejected it. */
    fun error() {
        runCatching { tone?.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 400) }
    }

    fun release() {
        runCatching { tone?.release() }
    }
}

/**
 * Remembers an [OperatorTones] tied to the composable's lifetime and releases
 * the underlying [ToneGenerator] when it leaves — a leaked one holds an audio
 * session open.
 */
@Composable
fun rememberOperatorTones(): OperatorTones {
    val tones = remember { OperatorTones() }
    DisposableEffect(tones) {
        onDispose { tones.release() }
    }
    return tones
}
