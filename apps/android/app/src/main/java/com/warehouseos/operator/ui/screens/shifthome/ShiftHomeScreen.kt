package com.warehouseos.operator.ui.screens.shifthome

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.R
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.SecondaryButton
import com.warehouseos.operator.ui.components.StatusBanner

/**
 * Shift home — the operator hub. No active session → a single "start shift"
 * action; active session → large stock-in / count actions. A pending-sync banner
 * surfaces queued offline work. Logout is confirmed and clears both sessions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShiftHomeScreen(
    onStockIn: () -> Unit,
    onCount: () -> Unit,
    onSettings: () -> Unit,
    onLogout: () -> Unit,
    viewModel: ShiftHomeViewModel = hiltViewModel(),
) {
    val sessionId by viewModel.sessionId.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val pendingCount by viewModel.pendingCount.collectAsState()
    var showLogoutConfirm by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.customer_name)) },
                actions = {
                    IconButton(onClick = { showLogoutConfirm = true }) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "خروج")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Dimens.screenPadding),
        ) {
            if (viewModel.fullName.isNotBlank()) {
                Text(
                    text = "سلام، ${viewModel.fullName}",
                    style = MaterialTheme.typography.titleMedium,
                )
                if (viewModel.roleLabel.isNotBlank()) {
                    Text(
                        text = viewModel.roleLabel,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                androidx.compose.foundation.layout.Spacer(Modifier.padding(top = Dimens.gap))
            }
            if (pendingCount > 0) {
                StatusBanner(
                    text = "$pendingCount مورد در انتظار همگام‌سازی — برای ارسال لمس کنید",
                    type = BannerType.Warning,
                    icon = Icons.Filled.CloudUpload,
                    onClick = viewModel::syncNow,
                    modifier = Modifier.padding(bottom = Dimens.gap),
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
            ) {
                if (sessionId == null) {
                    NoSessionContent(
                        isStarting = uiState.isStarting,
                        error = uiState.error,
                        onStartShift = viewModel::startShift,
                    )
                } else {
                    ActiveSessionContent(
                        isStarting = uiState.isStarting,
                        onStockIn = onStockIn,
                        onCount = onCount,
                        onSettings = onSettings,
                        onNewShift = viewModel::startShift,
                    )
                }
            }
        }
    }

    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = { Text("خروج از حساب") },
            text = { Text("آیا از خروج مطمئن هستید؟ شیفت جاری بسته می‌شود.") },
            confirmButton = {
                TextButton(onClick = {
                    showLogoutConfirm = false
                    viewModel.logout()
                    onLogout()
                }) { Text("خروج") }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutConfirm = false }) { Text("انصراف") }
            },
        )
    }
}

@Composable
private fun NoSessionContent(
    isStarting: Boolean,
    error: String?,
    onStartShift: () -> Unit,
) {
    Text(
        text = "شیفت کاری خود را آغاز کنید",
        style = MaterialTheme.typography.headlineSmall,
        textAlign = TextAlign.Center,
    )
    Text(
        text = "برای شروع ثبت کالا، ابتدا یک شیفت جدید باز کنید",
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(top = Dimens.gapSmall, bottom = Dimens.gapLarge),
    )
    PrimaryButton(
        text = "شروع شیفت",
        onClick = onStartShift,
        loading = isStarting,
        icon = Icons.Filled.Add,
    )
    if (error != null) {
        StatusBanner(
            text = error,
            type = BannerType.Error,
            modifier = Modifier.padding(top = Dimens.gap),
        )
    }
}

@Composable
private fun ActiveSessionContent(
    isStarting: Boolean,
    onStockIn: () -> Unit,
    onCount: () -> Unit,
    onSettings: () -> Unit,
    onNewShift: () -> Unit,
) {
    StatusBanner(
        text = "شیفت فعال است — آماده‌ی ثبت کالا",
        type = BannerType.Success,
        modifier = Modifier.padding(bottom = Dimens.gapLarge),
    )

    PrimaryButton(
        text = "ثبت ورود کالا",
        onClick = onStockIn,
        icon = Icons.Filled.Add,
        height = Dimens.hugeActionHeight,
    )
    SecondaryButton(
        text = "انبارگردانی",
        onClick = onCount,
        icon = Icons.Filled.Checklist,
        height = Dimens.hugeActionHeight,
        modifier = Modifier.padding(top = Dimens.gap),
    )

    SecondaryButton(
        text = "شروع شیفت جدید",
        onClick = onNewShift,
        enabled = !isStarting,
        modifier = Modifier.padding(top = Dimens.gapLarge),
    )
    TextButton(
        onClick = onSettings,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapSmall),
    ) {
        Icon(Icons.Filled.Settings, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
        Text("تنظیمات")
    }
}
