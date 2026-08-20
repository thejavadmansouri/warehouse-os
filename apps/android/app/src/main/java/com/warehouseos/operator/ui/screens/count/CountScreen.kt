package com.warehouseos.operator.ui.screens.count

import android.Manifest
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.ui.components.Dimens
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.warehouseos.operator.ui.screens.scan.BarcodeScanner

/**
 * Inventory count (Epic 7). Scan a shelf, then speak/type each item; every item is
 * recorded with its review status in a running list. Basic visuals.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun CountScreen(
    onBack: () -> Unit,
    viewModel: CountViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("انبارگردانی") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
        ) {
            when (state.phase) {
                CountPhase.SCAN -> ScanPhase(
                    isStarting = state.isStarting,
                    error = state.error,
                    onStart = viewModel::startCount,
                )

                CountPhase.COUNTING -> CountingPhase(
                    state = state,
                    onStart = viewModel::startListening,
                    onStop = viewModel::stopListening,
                    onSubmitManual = viewModel::submitItem,
                    onChangeShelf = viewModel::changeShelf,
                )
            }
        }
    }
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
private fun ScanPhase(
    isStarting: Boolean,
    error: String?,
    onStart: (String) -> Unit,
) {
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)
    var manual by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "بارکد قفسه‌ای که می‌شمارید را اسکن کنید",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 12.dp),
        )

        if (cameraPermission.status.isGranted) {
            BarcodeScanner(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp),
                onBarcodeDetected = onStart,
            )
        } else {
            Button(
                onClick = { cameraPermission.launchPermissionRequest() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
            ) { Text("اجازه دسترسی به دوربین") }
        }

        OutlinedTextField(
            value = manual,
            onValueChange = { manual = it },
            label = { Text("یا وارد کردن دستی بارکد") },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
        )
        Button(
            onClick = { onStart(manual.trim()) },
            enabled = manual.isNotBlank() && !isStarting,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(top = 12.dp),
        ) {
            if (isStarting) {
                CircularProgressIndicator(
                    modifier = Modifier.height(24.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                )
            } else {
                Text("شروع شمارش")
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
}

@Composable
private fun ColumnScope.CountingPhase(
    state: CountUiState,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onSubmitManual: (String) -> Unit,
    onChangeShelf: () -> Unit,
) {
    var manual by remember { mutableStateOf("") }

    Text(
        text = "قفسه: ${state.locationName}",
        style = MaterialTheme.typography.titleLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )

    if (state.offline) {
        Text(
            text = "آفلاین — شمارش در صف ثبت شد؛ پس از اتصال به سرور همگام می‌شود",
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFF1565C0),
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp),
        )
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FilledIconButton(
            onClick = { if (state.isListening) onStop() else onStart() },
            modifier = Modifier.size(112.dp),
            shape = CircleShape,
            colors = if (state.isListening) {
                IconButtonDefaults.filledIconButtonColors(containerColor = MaterialTheme.colorScheme.error)
            } else {
                IconButtonDefaults.filledIconButtonColors()
            },
        ) {
            Icon(
                imageVector = if (state.isListening) Icons.Filled.MicOff else Icons.Filled.Mic,
                contentDescription = if (state.isListening) "توقف" else "شروع ضبط",
                modifier = Modifier.size(Dimens.iconHuge),
            )
        }
        if (state.isSubmitting) {
            CircularProgressIndicator(modifier = Modifier.padding(start = 16.dp))
        }
    }

    if (state.partialText.isNotBlank()) {
        Text(
            text = state.partialText,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.primary,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
        )
    }

    OutlinedTextField(
        value = manual,
        onValueChange = { manual = it },
        label = { Text("یا وارد کردن دستی کالا") },
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
    )
    Button(
        onClick = {
            onSubmitManual(manual)
            manual = ""
        },
        enabled = manual.isNotBlank() && !state.isSubmitting,
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .padding(top = 8.dp),
    ) { Text("ثبت کالا") }

    if (state.error != null) {
        Text(
            text = state.error,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
        )
    }

    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
    Text("شمرده‌شده‌ها: ${state.items.size}", style = MaterialTheme.typography.bodyLarge)

    LazyColumn(modifier = Modifier.weight(1f)) {
        items(state.items) { item -> CountItemRow(item) }
    }

    OutlinedButton(
        onClick = onChangeShelf,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(top = 8.dp),
    ) { Text("قفسه بعدی") }
}

@Composable
private fun CountItemRow(item: CountedItem) {
    Card(modifier = Modifier
        .fillMaxWidth()
        .padding(vertical = 4.dp),
        shape = RoundedCornerShape(8.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(item.name, style = MaterialTheme.typography.bodyLarge)
                Text(
                    text = buildString {
                        append("سالم: ${item.goodQuantity}")
                        if (item.badQuantity > 0) append(" • خراب: ${item.badQuantity}")
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = statusLabel(item),
                style = MaterialTheme.typography.bodyLarge,
                color = statusColor(item),
            )
        }
    }
}

private fun statusLabel(item: CountedItem): String = when {
    // Offline-queued items carry no server review status yet.
    item.reviewStatus == null -> "در صف"
    !item.matched -> "تطبیق نشد"
    item.reviewStatus == "CONFIRMED" -> "تأیید"
    item.reviewStatus == "NEEDS_REVIEW" -> "بازبینی"
    item.reviewStatus == "NEEDS_CORRECTION" -> "اصلاح"
    else -> "ثبت شد"
}

private fun statusColor(item: CountedItem): Color = when {
    item.reviewStatus == null -> Color(0xFF1565C0) // queued (offline)
    !item.matched -> Color(0xFFC62828)
    item.reviewStatus == "CONFIRMED" -> Color(0xFF2E7D32)
    item.reviewStatus == "NEEDS_REVIEW" -> Color(0xFFF57C00)
    else -> Color(0xFFC62828)
}
