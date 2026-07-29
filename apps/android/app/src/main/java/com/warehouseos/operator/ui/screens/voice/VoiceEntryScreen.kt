package com.warehouseos.operator.ui.screens.voice

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.warehouseos.operator.ui.screens.PlaceholderScaffold

/**
 * Persian voice stock-in placeholder (Epic 0). Real SpeechRecognizer mic flow and
 * POST /inventory/voice (+ confirm) wiring: Epic 6.
 */
@Composable
fun VoiceEntryScreen(
    onBack: () -> Unit,
    onScanNext: () -> Unit,
) {
    PlaceholderScaffold(title = "ثبت صوتی کالا", onBack = onBack) {
        Text(
            "دکمه میکروفون و تشخیص گفتار فارسی در فاز بعدی اضافه می‌شود",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onScanNext,
            modifier = Modifier.fillMaxWidth().height(56.dp),
        ) { Text("اسکن قفسه بعدی (موقت)") }
    }
}
