package com.warehouseos.operator.ui.screens.sales

import android.Manifest
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.SecondaryButton
import com.warehouseos.operator.ui.components.StatusBanner
import com.warehouseos.operator.ui.screens.scan.BarcodeScanner

/**
 * فروش (مدیر): سرچ کالا → انتخاب مکانِ موجود → تعداد + قیمت → تأیید → کاهش موجودی.
 * فقط کالاهایی که کارگر ثبت/لیبل زده و موجودی مثبت دارند قابل فروش‌اند.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SalesScreen(
    onBack: () -> Unit,
    viewModel: SalesViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("فروش کالا") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (state.phase == SalesPhase.ENTRY) viewModel.backToSearch() else onBack()
                    }) {
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
                .padding(Dimens.screenPadding)
                .verticalScroll(rememberScrollState()),
        ) {
            when (state.phase) {
                SalesPhase.SEARCH -> SearchPhase(state, viewModel)
                SalesPhase.ENTRY -> EntryPhase(state, viewModel)
                SalesPhase.SUBMITTING -> com.warehouseos.operator.ui.components.LoadingState(
                    label = "در حال ثبت فروش…",
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 48.dp),
                )
                SalesPhase.SUCCESS -> SuccessPhase(state, viewModel)
            }

            if (state.error != null && state.phase != SalesPhase.SUBMITTING) {
                StatusBanner(
                    text = state.error!!,
                    type = BannerType.Error,
                    modifier = Modifier.padding(top = Dimens.gapLarge),
                )
            }
        }
    }
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
private fun SearchPhase(state: SalesUiState, vm: SalesViewModel) {
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)
    var scanning by remember { mutableStateOf(false) }
    var manualCode by remember { mutableStateOf("") }

    // ---- روش اصلی: اسکن بارکد ----
    if (scanning && cameraPermission.status.isGranted) {
        Text(
            text = "بارکد کالا را مقابل دوربین بگیرید",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = Dimens.gap),
        )
        BarcodeScanner(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(3f / 4f)
                .clip(RoundedCornerShape(Dimens.corner))
                .border(3.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(Dimens.corner)),
            onBarcodeDetected = { code ->
                scanning = false
                vm.resolveBarcode(code)
            },
        )
        SecondaryButton(
            text = "بستن دوربین",
            onClick = { scanning = false },
            modifier = Modifier.padding(top = Dimens.gap),
        )
    } else {
        PrimaryButton(
            text = "اسکن بارکد کالا",
            onClick = {
                if (cameraPermission.status.isGranted) scanning = true
                else cameraPermission.launchPermissionRequest()
            },
            icon = Icons.Filled.QrCodeScanner,
            height = Dimens.hugeActionHeight,
        )
    }

    // ---- ورود دستی بارکد/کد ----
    OutlinedTextField(
        value = manualCode,
        onValueChange = { manualCode = it },
        label = { Text("یا بارکد/کد کالا را وارد کنید") },
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapLarge),
    )
    PrimaryButton(
        text = "یافتن با کد",
        onClick = { vm.resolveBarcode(manualCode.trim()) },
        enabled = manualCode.isNotBlank(),
        modifier = Modifier.padding(top = Dimens.gapSmall),
    )

    // ---- جستجوی متنی (پشتیبان) ----
    HorizontalDivider(modifier = Modifier.padding(vertical = Dimens.gapLarge))
    Text("جستجو با نام", style = MaterialTheme.typography.titleSmall)
    OutlinedTextField(
        value = state.query,
        onValueChange = vm::onQueryChange,
        label = { Text("نام کالا") },
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapSmall),
    )
    SecondaryButton(
        text = "جستجو",
        onClick = vm::runSearch,
        enabled = state.query.isNotBlank(),
        icon = Icons.Filled.Search,
        modifier = Modifier.padding(top = Dimens.gapSmall),
    )
    state.results.forEach { p ->
        SecondaryButton(
            text = p.name + (p.sku?.let { " ($it)" } ?: ""),
            onClick = { vm.selectProduct(p) },
            modifier = Modifier.padding(top = Dimens.gapSmall),
        )
    }
}

@Composable
private fun EntryPhase(state: SalesUiState, vm: SalesViewModel) {
    val product = state.product ?: return

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Column(Modifier.padding(Dimens.cardPadding)) {
            Text(product.name, style = MaterialTheme.typography.titleMedium)
            if (!product.sku.isNullOrBlank()) {
                Text(
                    "کد: ${product.sku}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    if (state.loadingStock) {
        com.warehouseos.operator.ui.components.LoadingState(
            label = "بررسی موجودی…",
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Dimens.gapLarge),
        )
        return
    }

    if (state.stock.isEmpty()) {
        StatusBanner(
            text = "موجودی ثبت‌شده‌ای ندارد. ابتدا کارگر باید با اپ آن را در یک قفسه ثبت کند.",
            type = BannerType.Warning,
            modifier = Modifier.padding(top = Dimens.gapLarge),
        )
        SecondaryButton(
            text = "کالای دیگر",
            onClick = vm::backToSearch,
            modifier = Modifier.padding(top = Dimens.gap),
        )
        return
    }

    Text(
        text = "از کدام قفسه؟",
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(top = Dimens.gapLarge, bottom = Dimens.gapSmall),
    )
    state.stock.forEach { loc ->
        val selected = loc.locationId == state.selectedLocationId
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = Dimens.gapSmall),
            colors = CardDefaults.cardColors(
                containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surfaceContainer,
            ),
            onClick = { vm.selectLocation(loc.locationId) },
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Dimens.cardPadding),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(loc.locationName.ifBlank { loc.locationCode }, style = MaterialTheme.typography.bodyLarge)
                    if (loc.locationCode.isNotBlank()) {
                        Text(
                            loc.locationCode,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "موجودی",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text("${loc.quantity}", style = MaterialTheme.typography.displaySmall)
                }
            }
        }
    }

    // تعداد
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(top = Dimens.gap),
    ) {
        Text("تعداد فروش", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        FilledTonalIconButton(
            onClick = vm::decQuantity,
            modifier = Modifier.size(56.dp),
        ) {
            Icon(
                Icons.Filled.Remove,
                contentDescription = "کاهش",
                modifier = Modifier.size(Dimens.icon),
            )
        }
        Text(
            text = state.quantity.toString(),
            style = MaterialTheme.typography.displayMedium,
            modifier = Modifier.padding(horizontal = Dimens.gapLarge),
        )
        FilledTonalIconButton(
            onClick = vm::incQuantity,
            modifier = Modifier.size(56.dp),
        ) {
            Icon(
                Icons.Filled.Add,
                contentDescription = "افزایش",
                modifier = Modifier.size(Dimens.icon),
            )
        }
    }
    Text(
        text = "حداکثر ${state.maxQuantity}",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    // قیمت واحد
    OutlinedTextField(
        value = state.unitPrice?.toString() ?: "",
        onValueChange = vm::onPriceChange,
        label = { Text("قیمت واحد (ریال)") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gap),
    )

    if (state.unitPrice != null && state.unitPrice > 0) {
        Text(
            text = "مبلغ کل: ${formatMoney(state.total)} ریال",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = Dimens.gap),
        )
    }

    PrimaryButton(
        text = "ثبت فروش",
        onClick = vm::confirmSell,
        enabled = state.canSubmit,
        icon = Icons.Filled.ShoppingCart,
        height = Dimens.hugeActionHeight,
        modifier = Modifier.padding(top = Dimens.gapLarge),
    )
}

@Composable
private fun SuccessPhase(state: SalesUiState, vm: SalesViewModel) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = Dimens.gapLarge * 2),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.tertiary,
            modifier = Modifier.size(80.dp),
        )
        Text(
            text = state.successText ?: "فروش ثبت شد",
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Dimens.gap),
        )
        PrimaryButton(
            text = "فروش بعدی",
            onClick = vm::newSale,
            icon = Icons.Filled.ShoppingCart,
            height = Dimens.hugeActionHeight,
            modifier = Modifier.padding(top = Dimens.gapLarge),
        )
    }
}
