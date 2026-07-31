package com.warehouseos.operator.ui.screens.scan

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.accompanist.permissions.shouldShowRationale
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.SecondaryButton

/**
 * Location scan screen (Epic 5). Camera barcode/QR scanning via [BarcodeScanner],
 * with a camera-permission flow and an always-available manual-entry fallback so
 * the operator is never blocked. On detection it returns the raw barcode.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun ScanScreen(
    onScanned: (String) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

    var manualBarcode by remember { mutableStateOf("") }

    val reportBarcode: (String) -> Unit = { value ->
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        onScanned(value)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("اسکن قفسه") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
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
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (cameraPermission.status.isGranted) {
                Text(
                    text = "بارکد قفسه را مقابل دوربین بگیرید",
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(bottom = Dimens.gap),
                )
                BarcodeScanner(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(3f / 4f)
                        .clip(RoundedCornerShape(Dimens.corner))
                        .border(
                            width = 3.dp,
                            color = MaterialTheme.colorScheme.primary,
                            shape = RoundedCornerShape(Dimens.corner),
                        ),
                    onBarcodeDetected = reportBarcode,
                )
            } else {
                Text(
                    text = if (cameraPermission.status.shouldShowRationale) {
                        "برای اسکن بارکد به دوربین نیاز داریم. لطفاً دسترسی را بدهید."
                    } else {
                        "دسترسی به دوربین لازم است. اجازه دهید یا بارکد را دستی وارد کنید."
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(vertical = Dimens.gapLarge),
                )
                PrimaryButton(
                    text = "اجازه دسترسی به دوربین",
                    onClick = { cameraPermission.launchPermissionRequest() },
                )
                SecondaryButton(
                    text = "باز کردن تنظیمات",
                    onClick = {
                        context.startActivity(
                            Intent(
                                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                Uri.fromParts("package", context.packageName, null),
                            ),
                        )
                    },
                    modifier = Modifier.padding(top = Dimens.gap),
                )
            }

            // Manual-entry fallback — always available.
            Text(
                text = "یا وارد کردن دستی بارکد",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = Dimens.gapLarge, bottom = Dimens.gapSmall),
            )
            OutlinedTextField(
                value = manualBarcode,
                onValueChange = { manualBarcode = it },
                label = { Text("بارکد") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            PrimaryButton(
                text = "تأیید",
                onClick = { reportBarcode(manualBarcode.trim()) },
                enabled = manualBarcode.isNotBlank(),
                modifier = Modifier.padding(top = Dimens.gap),
            )
        }
    }
}
