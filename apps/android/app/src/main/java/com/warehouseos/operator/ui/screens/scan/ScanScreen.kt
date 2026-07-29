package com.warehouseos.operator.ui.screens.scan

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
 * Barcode/QR scan placeholder (Epic 0). Real CameraX + ML Kit scanning and the
 * GET /locations/resolve/:barcode call: Epic 5.
 */
@Composable
fun ScanScreen(
    onProceedToVoice: () -> Unit,
    onBack: () -> Unit,
) {
    PlaceholderScaffold(title = "اسکن قفسه", onBack = onBack) {
        Text(
            "دوربین اسکن بارکد در فاز بعدی اضافه می‌شود",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onProceedToVoice,
            modifier = Modifier.fillMaxWidth().height(56.dp),
        ) { Text("ادامه به ثبت صوتی (موقت)") }
    }
}
