package com.warehouseos.operator.ui.screens.count

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.style.TextAlign
import com.warehouseos.operator.ui.screens.PlaceholderScaffold

/**
 * Inventory count placeholder (Epic 0). Real scan → POST /mobile/count/start →
 * voice count flow: Epic 7.
 */
@Composable
fun CountScreen(
    onBack: () -> Unit,
) {
    PlaceholderScaffold(title = "انبارگردانی", onBack = onBack) {
        Text(
            "جریان شمارش موجودی در فاز بعدی اضافه می‌شود",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
    }
}
