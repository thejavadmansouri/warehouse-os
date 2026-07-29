package com.warehouseos.operator.ui.screens.shifthome

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.warehouseos.operator.ui.screens.PlaceholderScaffold

/**
 * Shift home placeholder (Epic 0). Real session start + active-session state: Epic 4.
 * The two large primary actions and settings/logout entry points are stubbed here.
 */
@Composable
fun ShiftHomeScreen(
    onStockIn: () -> Unit,
    onCount: () -> Unit,
    onSettings: () -> Unit,
    onLogout: () -> Unit,
) {
    PlaceholderScaffold(title = "شیفت کاری") {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Button(
                onClick = onStockIn,
                modifier = Modifier.fillMaxWidth().height(96.dp),
            ) { Text("ثبت ورود کالا") }

            Button(
                onClick = onCount,
                modifier = Modifier.fillMaxWidth().height(96.dp),
            ) { Text("انبارگردانی") }

            OutlinedButton(
                onClick = onSettings,
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) { Text("تنظیمات") }

            TextButton(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("خروج") }
        }
    }
}
