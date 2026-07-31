package com.warehouseos.operator.ui.screens.newproduct

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.SecondaryButton
import com.warehouseos.operator.ui.components.StatusBanner

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewProductRequestScreen(
    onBack: () -> Unit,
    onDone: () -> Unit,
    viewModel: NewProductRequestViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
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

            OutlinedTextField(
                value = state.name,
                onValueChange = viewModel::onNameChange,
                label = { Text("نام کالا") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.brand,
                onValueChange = viewModel::onBrandChange,
                label = { Text("برند") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Dimens.fieldSpacing),
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
                OutlinedTextField(
                    value = state.vehicleInput,
                    onValueChange = viewModel::onVehicleInputChange,
                    label = { Text("مثلاً پژو ۲۰۶") },
                    singleLine = true,
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
            OutlinedTextField(
                value = state.notes,
                onValueChange = viewModel::onNotesChange,
                label = { Text("توضیحات (اختیاری)") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Dimens.fieldSpacing),
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
