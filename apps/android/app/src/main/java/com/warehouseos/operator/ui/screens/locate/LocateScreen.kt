package com.warehouseos.operator.ui.screens.locate

import android.Manifest
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.warehouseos.operator.data.remote.dto.LocateResultDto
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.SecondaryButton
import com.warehouseos.operator.ui.components.StatusBanner
import com.warehouseos.operator.ui.components.faNum
import com.warehouseos.operator.ui.screens.scan.BarcodeScanner

/**
 * «یافتن کالا» — اسکن لیبل/بارکد یا جستجوی نام؛ اگر موجودی داشته باشد آدرس قفسه را می‌گوید.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun LocateScreen(
    onBack: () -> Unit,
    viewModel: LocateViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("یافتن کالا", fontWeight = FontWeight.Bold)
                        Text(
                            "اسکن لیبل یا جستجوی نام",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = {
                        if (state.scanning) viewModel.closeScanner() else onBack()
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        if (state.scanning) {
            ScanPanel(
                cameraGranted = cameraPermission.status.isGranted,
                onRequestCamera = { cameraPermission.launchPermissionRequest() },
                onBarcode = viewModel::onBarcodeScanned,
                onCancel = viewModel::closeScanner,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(Dimens.screenPadding),
            )
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Dimens.screenPadding),
        ) {
            HeroHint()

            PrimaryButton(
                text = "اسکن لیبل کالا",
                onClick = {
                    if (cameraPermission.status.isGranted) viewModel.openScanner()
                    else cameraPermission.launchPermissionRequest()
                },
                icon = Icons.Filled.QrCodeScanner,
                height = Dimens.hugeActionHeight,
                modifier = Modifier.padding(top = Dimens.gap),
            )

            Text(
                text = "یا نام / کد را تایپ کنید",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Dimens.gapLarge, bottom = Dimens.gapSmall),
                textAlign = TextAlign.Center,
            )

            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                label = { Text("نام کالا، SKU یا بارکد") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { viewModel.search() }),
                trailingIcon = {
                    IconButton(
                        onClick = viewModel::search,
                        enabled = state.query.isNotBlank() && !state.loading,
                    ) {
                        Icon(Icons.Filled.Search, contentDescription = "جستجو")
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )

            SecondaryButton(
                text = if (state.loading) "در حال جستجو…" else "جستجو",
                onClick = viewModel::search,
                enabled = state.query.isNotBlank() && !state.loading,
                icon = Icons.Filled.Search,
                modifier = Modifier.padding(top = Dimens.gapSmall),
            )

            state.lastScanned?.let { code ->
                Text(
                    text = "اسکن‌شده: $code",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.padding(top = Dimens.gapSmall),
                )
            }

            if (state.error != null) {
                StatusBanner(
                    text = state.error!!,
                    type = BannerType.Error,
                    modifier = Modifier.padding(top = Dimens.gap),
                )
            }

            if (state.searched && state.results.isEmpty() && !state.loading) {
                EmptyResults()
            }

            LazyColumn(
                modifier = Modifier
                    .padding(top = Dimens.gap)
                    .weight(1f, fill = true),
                verticalArrangement = Arrangement.spacedBy(Dimens.gapSmall),
            ) {
                items(state.results, key = { it.id }) { item ->
                    LocateCard(item)
                }
                item { Spacer(Modifier.height(Dimens.gapLarge)) }
            }
        }
    }
}

@Composable
private fun HeroHint() {
    val teal = Color(0xFF0F766E)
    Surface(
        shape = RoundedCornerShape(Dimens.corner),
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gap),
        color = Color.Transparent,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Dimens.corner))
                .background(
                    Brush.horizontalGradient(
                        listOf(teal.copy(alpha = 0.16f), teal.copy(alpha = 0.06f)),
                    ),
                )
                .padding(Dimens.cardPadding),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = CircleShape,
                    color = teal.copy(alpha = 0.18f),
                    contentColor = teal,
                ) {
                    Icon(
                        Icons.Filled.Inventory2,
                        contentDescription = null,
                        modifier = Modifier
                            .padding(12.dp)
                            .size(Dimens.icon),
                    )
                }
                Column(Modifier.padding(start = Dimens.gap)) {
                    Text(
                        "کجای انبار است؟",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "لیبل روی جعبه را اسکن کنید تا قفسه و موجودی را ببینید",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun ScanPanel(
    cameraGranted: Boolean,
    onRequestCamera: () -> Unit,
    onBarcode: (String) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "لیبل یا بارکد روی کالا را مقابل دوربین بگیرید",
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = Dimens.gap),
        )

        if (cameraGranted) {
            BarcodeScanner(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(3f / 4f)
                    .clip(RoundedCornerShape(Dimens.corner))
                    .border(
                        width = 3.dp,
                        color = Color(0xFF0F766E),
                        shape = RoundedCornerShape(Dimens.corner),
                    ),
                onBarcodeDetected = onBarcode,
            )
        } else {
            SecondaryButton(
                text = "اجازه دسترسی به دوربین",
                onClick = onRequestCamera,
                modifier = Modifier.padding(vertical = Dimens.gapLarge),
            )
        }

        SecondaryButton(
            text = "انصراف — تایپ می‌کنم",
            onClick = onCancel,
            modifier = Modifier.padding(top = Dimens.gap),
        )
    }
}

@Composable
private fun EmptyResults() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapLarge),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Filled.Search,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f),
            modifier = Modifier.size(48.dp),
        )
        Text(
            text = "کالایی پیدا نشد",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = Dimens.gapSmall),
        )
        Text(
            text = "نام دیگر، کد کالا، یا اسکن لیبل را امتحان کنید",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun LocateCard(item: LocateResultDto) {
    val inStock = item.totalStock > 0
    val accent = if (inStock) Color(0xFF0F766E) else MaterialTheme.colorScheme.outline
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = RoundedCornerShape(Dimens.corner),
    ) {
        Column(Modifier.padding(Dimens.cardPadding)) {
            Row(verticalAlignment = Alignment.Top) {
                Box(
                    modifier = Modifier
                        .padding(end = Dimens.gapSmall)
                        .size(4.dp, 44.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(accent),
                )
                Column(Modifier.weight(1f)) {
                    Text(
                        item.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (!item.sku.isNullOrBlank()) {
                            Text(
                                "کد ${item.sku}",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        item.brandName?.takeIf { it.isNotBlank() }?.let { brand ->
                            Text(
                                brand,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                if (inStock) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = accent.copy(alpha = 0.12f),
                        contentColor = accent,
                    ) {
                        Text(
                            text = "${faNum(item.totalStock)} ${item.unit ?: "عدد"}",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                }
            }

            if (!inStock) {
                StatusBanner(
                    text = "موجودی ثبت‌شده ندارد — هنوز در انبار ثبت نشده",
                    type = BannerType.Warning,
                    modifier = Modifier.padding(top = Dimens.gapSmall),
                )
            } else {
                Column(Modifier.padding(top = Dimens.gapSmall)) {
                    item.locations.forEach { loc ->
                        Surface(
                            shape = RoundedCornerShape(Dimens.cornerSmall),
                            color = MaterialTheme.colorScheme.surfaceContainer,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 3.dp),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(
                                    horizontal = Dimens.gap,
                                    vertical = Dimens.gapSmall,
                                ),
                            ) {
                                Icon(
                                    Icons.Filled.LocationOn,
                                    contentDescription = null,
                                    tint = accent,
                                    modifier = Modifier.size(Dimens.iconSmall),
                                )
                                Column(Modifier.padding(start = 8.dp).weight(1f)) {
                                    Text(
                                        text = loc.path.ifBlank { loc.name.ifBlank { loc.code } },
                                        style = MaterialTheme.typography.bodyLarge,
                                        fontWeight = FontWeight.Medium,
                                    )
                                    if (loc.code.isNotBlank()) {
                                        Text(
                                            loc.code,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                Text(
                                    text = faNum(loc.quantity),
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = accent,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
