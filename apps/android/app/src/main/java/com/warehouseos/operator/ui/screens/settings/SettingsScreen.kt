package com.warehouseos.operator.ui.screens.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.style.TextAlign
import com.warehouseos.operator.BuildConfig
import com.warehouseos.operator.ui.screens.PlaceholderScaffold

/**
 * Settings placeholder (Epic 0). Real editable base-URL + connection test: Epic 9.
 * Shows the compiled-in default so the flavor wiring is visible during scaffolding.
 */
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
) {
    PlaceholderScaffold(title = "تنظیمات", onBack = onBack) {
        Text(
            "آدرس سرور (پیش‌فرض): ${BuildConfig.BASE_URL}\n" +
                "ویرایش آدرس و تست اتصال در فاز بعدی اضافه می‌شود",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
    }
}
