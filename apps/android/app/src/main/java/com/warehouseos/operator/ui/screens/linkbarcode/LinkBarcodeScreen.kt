package com.warehouseos.operator.ui.screens.linkbarcode

import android.Manifest
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.StatusBanner
import com.warehouseos.operator.ui.screens.scan.BarcodeScanner

/**
 * «اتصال بارکد» — بارکدِ روی جعبه را به کالای کاتالوگ می‌چسباند.
 *
 * صرفه‌جویی‌اش این است که یک مرحله‌ی فیزیکی حذف می‌شود: کالایی که بارکدِ خوانا
 * روی جعبه دارد دیگر برچسبِ چاپی لازم ندارد.
 *
 * دو مرحله، عمداً به همین ترتیب: **اول بارکد، بعد کالا.** اگر اول کالا انتخاب
 * می‌شد، کارگر باید جعبه را زمین می‌گذاشت و گوشی را با دو دست می‌گرفت.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun LinkBarcodeScreen(
    onBack: () -> Unit,
    viewModel: LinkBarcodeViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)
    var manual by remember { mutableStateOf("") }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbar.showSnackbar(it)
            viewModel.clearToast()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("اتصال بارکد") },
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Dimens.screenPadding),
        ) {
            if (state.barcode.isEmpty()) {
                // ---- مرحله ۱: اسکن جعبه ----
                Text(
                    text = "بارکد روی جعبه را اسکن کنید",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(bottom = Dimens.gap),
                )

                if (cameraPermission.status.isGranted) {
                    BarcodeScanner(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(260.dp),
                        onBarcodeDetected = viewModel::onBarcode,
                    )
                } else {
                    Button(
                        onClick = { cameraPermission.launchPermissionRequest() },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("اجازه دسترسی به دوربین") }
                }

                OutlinedTextField(
                    value = manual,
                    onValueChange = { manual = it },
                    label = { Text("یا بارکد را دستی وارد کنید") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Dimens.gap),
                )
                Button(
                    enabled = manual.isNotBlank(),
                    onClick = {
                        viewModel.onBarcode(manual)
                        manual = ""
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Dimens.gapSmall),
                ) { Text("ادامه") }
            } else {
                // ---- مرحله ۲: این بارکد مالِ کدام کالاست؟ ----
                Text(
                    text = state.barcode,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )

                val owner = state.alreadyLinkedTo
                if (owner != null) {
                    // کارِ تمام‌شده است، نه خطا — ولی کارگر باید بداند و دوباره
                    // وصلش نکند.
                    StatusBanner(
                        text = "این بارکد از قبل به «${owner.name}» وصل است",
                        type = BannerType.Success,
                        modifier = Modifier.padding(vertical = Dimens.gap),
                    )
                    Button(
                        onClick = viewModel::reset,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("جعبه‌ی بعدی") }
                } else {
                    Text(
                        text = "این بارکد آزاد است. کالایش را پیدا کنید.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp, bottom = Dimens.gap),
                    )

                    OutlinedTextField(
                        value = state.query,
                        onValueChange = viewModel::onQueryChange,
                        label = { Text("نام یا کد کالا") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )

                    Spacer(Modifier.height(Dimens.gap))

                    LazyColumn(modifier = Modifier.weight(1f)) {
                        items(state.results, key = { it.id }) { product ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = Dimens.gapSmall),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.surfaceContainer,
                                ),
                                onClick = { viewModel.link(product) },
                            ) {
                                Column(modifier = Modifier.padding(Dimens.cardPadding)) {
                                    Text(
                                        text = product.name,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = product.sku,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }

                    OutlinedButton(
                        onClick = viewModel::reset,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("انصراف") }
                }
            }
        }
    }
}
