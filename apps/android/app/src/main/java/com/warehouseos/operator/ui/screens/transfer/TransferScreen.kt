package com.warehouseos.operator.ui.screens.transfer

import android.Manifest
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.KeepScreenOn
import com.warehouseos.operator.ui.components.SecondaryButton
import com.warehouseos.operator.ui.screens.scan.BarcodeScanner

/**
 * «انتقال بین قفسه» — پوسته‌ی صفحه که اسکنر دوربین را به مراحل مبدأ/مقصدِ
 * [TransferContent] وصل می‌کند و پیام‌های موفقیت را با Snackbar نشان می‌دهد.
 *
 * خودِ محتوا stateless است ([TransferContent])؛ همه‌ی حالت در [TransferViewModel]
 * و همه‌ی شبکه در Repository است — این فایل فقط جمع‌شان می‌کند.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun TransferScreen(
    onBack: () -> Unit,
    viewModel: TransferViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val toast by viewModel.toast.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

    // Moving stock is hands-full work like every other floor task here.
    KeepScreenOn()

    LaunchedEffect(toast) {
        toast?.let {
            snackbar.showSnackbar(it)
            viewModel.clearToast()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("انتقال بین قفسه") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainer,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        TransferContent(
            state = state,
            onPickProduct = viewModel::onPickProduct,
            onQuantityChange = viewModel::onQuantityChange,
            onConfirmQuantity = viewModel::onConfirmQuantity,
            onSubmit = viewModel::onSubmit,
            onBackStep = viewModel::onBackStep,
            onRetry = viewModel::onRetry,
            modifier = Modifier.padding(padding),
            scannerSlot = {
                // اسکنر فقط در مراحل SOURCE و DESTINATION رندر می‌شود؛ مسیرِ
                // بارکدِ خوانده‌شده بر اساس همان مرحله انتخاب می‌شود.
                val submit: (String) -> Unit = { barcode ->
                    if (state.step == TransferStep.SOURCE) {
                        viewModel.onSourceBarcode(barcode)
                    } else {
                        viewModel.onDestinationBarcode(barcode)
                    }
                }

                if (cameraPermission.status.isGranted) {
                    BarcodeScanner(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(260.dp),
                        onBarcodeDetected = submit,
                    )
                } else {
                    Button(
                        onClick = { cameraPermission.launchPermissionRequest() },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("اجازه دسترسی به دوربین") }
                }

                /*
                 * ورود دستی، همیشه در دسترس — نه فقط وقتی دوربین رد شده.
                 *
                 * بدون این، لیبلِ خط‌خورده یا دوربینِ خراب کلِ انتقال را بن‌بست
                 * می‌کرد. بقیه‌ی صفحه‌های اسکن همین تکیه‌گاه را دارند.
                 */
                var manual by remember { mutableStateOf("") }
                Text(
                    text = "یا وارد کردن دستی بارکد",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(top = Dimens.gap, bottom = Dimens.gapSmall),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = manual,
                        onValueChange = { manual = it },
                        label = { Text("بارکد قفسه") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    SecondaryButton(
                        text = "تأیید",
                        onClick = {
                            submit(manual.trim())
                            manual = ""
                        },
                        enabled = manual.isNotBlank() && !state.loading,
                        modifier = Modifier.padding(start = Dimens.gapSmall),
                    )
                }
            },
        )
    }
}