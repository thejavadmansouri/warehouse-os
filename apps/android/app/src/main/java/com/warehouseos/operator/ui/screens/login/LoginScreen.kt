package com.warehouseos.operator.ui.screens.login

import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.warehouseos.operator.ui.screens.PlaceholderScaffold

/**
 * Login placeholder (Epic 0). Real username/password form + auth wiring: Epic 3.
 */
@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
) {
    PlaceholderScaffold(title = "ورود اپراتور") {
        Text(
            "صفحه ورود — در فاز بعدی نام کاربری و رمز عبور اضافه می‌شود",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onLoggedIn,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
        ) {
            Text("ورود (موقت)")
        }
    }
}
