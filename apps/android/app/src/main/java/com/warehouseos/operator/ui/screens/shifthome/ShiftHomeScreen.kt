package com.warehouseos.operator.ui.screens.shifthome

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

/**
 * Shift home (Epic 4). No active session -> a single "start shift" button;
 * active session -> stock-in / count actions plus "start new shift". Logout is
 * confirmed and clears both the shift session and the encrypted auth session.
 * Visuals are intentionally basic — feature completion first.
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
                title = { Text(viewModel.fullName.ifBlank { "شیفت کاری" }) },
                actions = {
                    IconButton(onClick = { showLogoutConfirm = true }) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "خروج")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            if (pendingCount > 0) {
                TextButton(onClick = viewModel::syncNow) {
                    Text("$pendingCount مورد در انتظار همگام‌سازی — لمس برای ارسال")
                }
            }
            if (sessionId == null) {
                NoSessionContent(
                    isStarting = uiState.isStarting,
                    error = uiState.error,
                    onStartShift = viewModel::startShift,
                )
            } else {
                ActiveSessionContent(
                    sessionId = sessionId!!,
                    isStarting = uiState.isStarting,
                    onStockIn = onStockIn,
                    onCount = onCount,
                    onSettings = onSettings,
                    onNewShift = viewModel::startShift,
                )
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
        text = "برای شروع کار، شیفت جدید را باز کنید",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(bottom = 24.dp),
    )
    Button(
        onClick = onStartShift,
        enabled = !isStarting,
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp),
    ) {
        if (isStarting) {
            CircularProgressIndicator(
                modifier = Modifier.height(24.dp),
                color = MaterialTheme.colorScheme.onPrimary,
                strokeWidth = 2.dp,
            )
        } else {
            Text("شروع شیفت", style = MaterialTheme.typography.titleLarge)
        }
    }
    if (error != null) {
        Text(
            text = error,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
        )
    }
}

@Composable
private fun ActiveSessionContent(
    sessionId: String,
    isStarting: Boolean,
    onStockIn: () -> Unit,
    onCount: () -> Unit,
    onSettings: () -> Unit,
    onNewShift: () -> Unit,
) {
    Button(
        onClick = onStockIn,
        modifier = Modifier
            .fillMaxWidth()
            .height(96.dp),
    ) { Text("ثبت ورود کالا", style = MaterialTheme.typography.titleLarge) }

    Button(
        onClick = onCount,
        modifier = Modifier
            .fillMaxWidth()
            .height(96.dp)
            .padding(top = 16.dp),
    ) { Text("انبارگردانی", style = MaterialTheme.typography.titleLarge) }

    OutlinedButton(
        onClick = onNewShift,
        enabled = !isStarting,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(top = 16.dp),
    ) { Text("شروع شیفت جدید") }

    TextButton(
        onClick = onSettings,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("تنظیمات") }

    Text(
        text = "شناسه شیفت: ${sessionId.take(8)}",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(top = 16.dp),
    )
}
