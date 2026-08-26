package com.warehouseos.operator.ui.screens.newproduct

import android.Manifest
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
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
import com.warehouseos.operator.ui.components.faNum
import com.warehouseos.operator.ui.screens.scan.BarcodeScanner

@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun NewProductRequestScreen(
    onBack: () -> Unit,
    onDone: () -> Unit,
    viewModel: NewProductRequestViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val micPermission = rememberPermissionState(Manifest.permission.RECORD_AUDIO)
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)
    val haptic = LocalHapticFeedback.current

    LaunchedEffect(state.done) {
        if (state.done) haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.done) "درخواست ثبت شد" else "افزودن کالای جدید") },
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
        if (state.done) {
            SuccessContent(name = state.name, quantity = state.quantity, unit = state.unit, onNext = onDone, padding = padding)
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(Dimens.screenPadding),
        ) {
            Text(
                text = "اطلاعات کالا را بررسی و در صورت نیاز اصلاح کنید",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = Dimens.gap),
            )

            /*
             * بارکد جعبه.
             *
             * اگر از صفحه‌ی قبل آمده، تأییدش را نشان می‌دهیم؛ اگر نه، همین‌جا
             * قابل اسکن است. کارگری که از مسیر صدا رسیده هیچ بارکدی همراه ندارد
             * در حالی که جعبه ممکن است بارکد داشته باشد — بدون این دکمه، آن
             * بارکد برای همیشه از دست می‌رفت و همان جعبه دفعه‌ی بعد باز ناشناس بود.
             */
            if (state.scanning) {
                Text(
                    text = "بارکد روی جعبه را مقابل دوربین بگیرید",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(bottom = Dimens.gapSmall),
                )
                if (cameraPermission.status.isGranted) {
                    BarcodeScanner(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(4f / 3f)
                            .clip(RoundedCornerShape(Dimens.corner)),
                        onBarcodeDetected = viewModel::onBarcodeScanned,
                    )
                } else {
                    PrimaryButton(
                        text = "اجازه دسترسی به دوربین",
                        onClick = { cameraPermission.launchPermissionRequest() },
                    )
                }
                SecondaryButton(
                    text = "انصراف",
                    onClick = viewModel::closeScanner,
                    modifier = Modifier.padding(top = Dimens.gapSmall, bottom = Dimens.gap),
                )
            } else if (state.productBarcode.isNotBlank()) {
                StatusBanner(
                    text = "بارکد ${faNum(state.productBarcode)} پس از تأیید مدیر" +
                        " به همین کالا وصل می‌شود",
                    type = BannerType.Success,
                    modifier = Modifier.padding(bottom = Dimens.gapSmall),
                )
                SecondaryButton(
                    text = "اسکن دوباره",
                    onClick = viewModel::openScanner,
                    icon = Icons.Filled.QrCodeScanner,
                    modifier = Modifier.padding(bottom = Dimens.gap),
                )
            } else {
                SecondaryButton(
                    text = "اسکن بارکد روی جعبه (اختیاری)",
                    onClick = viewModel::openScanner,
                    icon = Icons.Filled.QrCodeScanner,
                    modifier = Modifier.padding(bottom = Dimens.gap),
                )
            }

            DictatableField(
                value = state.name,
                onValueChange = viewModel::onNameChange,
                label = "نام کالا",
                field = DictationField.NAME,
                state = state,
                micGranted = micPermission.status.isGranted,
                onRequestMic = { micPermission.launchPermissionRequest() },
                onDictate = viewModel::dictate,
            )
            DictatableField(
                value = state.brand,
                onValueChange = viewModel::onBrandChange,
                label = "برند",
                field = DictationField.BRAND,
                state = state,
                micGranted = micPermission.status.isGranted,
                onRequestMic = { micPermission.launchPermissionRequest() },
                onDictate = viewModel::dictate,
                modifier = Modifier.padding(top = Dimens.fieldSpacing),
            )

            // Compatible vehicles (multiple).
            Text(
                text = "مناسب برای خودرو",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = Dimens.gapLarge, bottom = Dimens.gapSmall),
            )
            state.vehicles.forEach { v ->
                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = Dimens.gapSmall),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 12.dp)) {
                        Text("✓ $v", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        IconButton(onClick = { viewModel.removeVehicle(v) }) {
                            Icon(Icons.Filled.Close, contentDescription = "حذف")
                        }
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                DictatableField(
                    value = state.vehicleInput,
                    onValueChange = viewModel::onVehicleInputChange,
                    label = "مثلاً پژو ۲۰۶",
                    field = DictationField.VEHICLE,
                    state = state,
                    micGranted = micPermission.status.isGranted,
                    onRequestMic = { micPermission.launchPermissionRequest() },
                    onDictate = viewModel::dictate,
                    modifier = Modifier.weight(1f),
                )
                SecondaryButton(
                    text = "افزودن",
                    onClick = viewModel::addVehicle,
                    enabled = state.vehicleInput.isNotBlank(),
                    icon = Icons.Filled.Add,
                    modifier = Modifier
                        .weight(0.7f)
                        .padding(start = Dimens.gapSmall),
                )
            }

            // Quantity stepper + unit.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = Dimens.gapLarge),
            ) {
                Text("تعداد", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                FilledTonalIconButton(onClick = viewModel::decQuantity) {
                    Icon(Icons.Filled.Remove, contentDescription = "کاهش")
                }
                Text(
                    text = state.quantity.toString(),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(horizontal = Dimens.gapLarge),
                )
                FilledTonalIconButton(onClick = viewModel::incQuantity) {
                    Icon(Icons.Filled.Add, contentDescription = "افزایش")
                }
            }
            OutlinedTextField(
                value = state.unit,
                onValueChange = viewModel::onUnitChange,
                label = { Text("واحد") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Dimens.fieldSpacing),
            )
            DictatableField(
                value = state.notes,
                onValueChange = viewModel::onNotesChange,
                label = "توضیحات (اختیاری)",
                field = DictationField.NOTES,
                state = state,
                micGranted = micPermission.status.isGranted,
                onRequestMic = { micPermission.launchPermissionRequest() },
                onDictate = viewModel::dictate,
                singleLine = false,
                modifier = Modifier.padding(top = Dimens.fieldSpacing),
            )

            if (state.error != null) {
                StatusBanner(
                    text = state.error!!,
                    type = BannerType.Error,
                    modifier = Modifier.padding(top = Dimens.gapLarge),
                )
            }

            PrimaryButton(
                text = "ارسال درخواست",
                onClick = viewModel::submit,
                enabled = state.canSubmit,
                loading = state.isSubmitting,
                icon = Icons.Filled.Send,
                modifier = Modifier.padding(top = Dimens.gapLarge),
            )
        }
    }
}

@Composable
private fun SuccessContent(
    name: String,
    quantity: Int,
    unit: String,
    onNext: () -> Unit,
    padding: androidx.compose.foundation.layout.PaddingValues,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(Dimens.screenPadding),
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
            text = "درخواست ثبت شد",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(top = Dimens.gap),
        )
        Text(
            text = "$name — $quantity $unit",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Dimens.gapSmall),
        )
        Text(
            text = "اطلاعات کالا برای بررسی مدیر ارسال شد. پس از تأیید، کالا در سیستم ثبت خواهد شد.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = Dimens.gap),
        )
        PrimaryButton(
            text = "کالای بعدی",
            onClick = onNext,
            modifier = Modifier.padding(top = Dimens.gapLarge),
        )
    }
}

/**
 * یک فیلد متنی با دکمه‌ی میکروفون کنارش.
 *
 * این فرم بیشترین تایپِ کلِ برنامه را دارد و کارگر با دستکش سرِ پا ایستاده؛
 * بدون این، عملاً یا توضیحات خالی می‌ماند یا کل فرم گران تمام می‌شود.
 */
@Composable
private fun DictatableField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    field: DictationField,
    state: NewProductUiState,
    micGranted: Boolean,
    onRequestMic: () -> Unit,
    onDictate: (DictationField) -> Unit,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
) {
    val listening = state.listeningField == field
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier.fillMaxWidth(),
    ) {
        OutlinedTextField(
            value = if (listening && state.partialText.isNotBlank()) state.partialText else value,
            onValueChange = onValueChange,
            label = { Text(label) },
            singleLine = singleLine,
            enabled = !listening,
            modifier = Modifier.weight(1f),
        )
        FilledIconButton(
            onClick = { if (!micGranted) onRequestMic() else onDictate(field) },
            modifier = Modifier
                .padding(start = Dimens.gapSmall)
                .size(52.dp),
            shape = CircleShape,
            colors = if (listening) {
                IconButtonDefaults.filledIconButtonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                )
            } else {
                IconButtonDefaults.filledIconButtonColors()
            },
        ) {
            Icon(
                imageVector = if (listening) Icons.Filled.MicOff else Icons.Filled.Mic,
                contentDescription = if (listening) "توقف" else "گفتن $label",
                modifier = Modifier.size(Dimens.iconSmall),
            )
        }
    }
}
