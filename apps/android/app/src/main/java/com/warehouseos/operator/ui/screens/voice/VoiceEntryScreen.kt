package com.warehouseos.operator.ui.screens.voice

import android.Manifest
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import com.warehouseos.operator.ui.navigation.NewProductPrefill

/**
 * Voice stock-in (propose → confirm). Speak/type → backend proposes a product
 * (no commit) → worker confirms → queued for manager approval. The status strip
 * keeps the worker oriented: Speak → Processing → Result → Confirm → Done.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun VoiceEntryScreen(
    onBack: () -> Unit,
    onScanNext: () -> Unit,
    onRequestNewProduct: (NewProductPrefill) -> Unit,
    viewModel: VoiceEntryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val micPermission = rememberPermissionState(Manifest.permission.RECORD_AUDIO)
    val haptic = LocalHapticFeedback.current

    fun prefill(nameOverride: String?) = NewProductPrefill(
        barcode = viewModel.barcode,
        // Never fall back to the raw transcript here — it still has the quantity
        // phrase in it (e.g. "۱۷۳ تا لنت پراید") and would duplicate the qty field
        // below. The full transcript is preserved separately via `voice` for the
        // manager to read, so leaving this blank when recognition fails is safe.
        name = nameOverride?.takeIf { it.isNotBlank() } ?: state.recognizedName,
        brand = state.recognizedBrand,
        vehicle = state.recognizedVehicle,
        qty = state.quantity,
        unit = state.unit ?: "عدد",
        voice = state.transcript,
    )

    // Warm the speech engine as soon as the screen opens → the first mic tap is instant.
    LaunchedEffect(Unit) { viewModel.prewarmMic() }

    LaunchedEffect(state.phase) {
        if (state.phase == VoicePhase.SUCCESS) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ثبت صوتی کالا") },
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
                .padding(Dimens.screenPadding)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            ShelfHeader(barcode = viewModel.barcode)
            PhaseStrip(phase = state.phase, modifier = Modifier.padding(top = Dimens.gap, bottom = Dimens.gapLarge))

            when (state.phase) {
                VoicePhase.INPUT -> InputPhase(
                    state = state,
                    micGranted = micPermission.status.isGranted,
                    onRequestMic = { micPermission.launchPermissionRequest() },
                    onStart = viewModel::startListening,
                    onStop = viewModel::stopListening,
                    onTranscriptChange = viewModel::onTranscriptChange,
                    onPreview = viewModel::runPreview,
                )

                VoicePhase.PREVIEWING -> LoadingBlock("در حال بررسی گفته‌ی شما…")

                VoicePhase.CONFIRM -> ConfirmPhase(
                    state = state,
                    onConfirm = viewModel::confirm,
                    onCancel = viewModel::cancelToInput,
                )

                VoicePhase.SELECT -> SelectPhase(
                    state = state,
                    onSearch = viewModel::onSearchQuery,
                    onPick = viewModel::selectChoice,
                    onCancel = viewModel::cancelToInput,
                    onAddNew = { q -> onRequestNewProduct(prefill(q)) },
                )

                VoicePhase.NOT_FOUND -> NotFoundPhase(
                    state = state,
                    onManualSearch = viewModel::searchManually,
                    onRetry = viewModel::cancelToInput,
                    onAddNew = { onRequestNewProduct(prefill(null)) },
                )

                VoicePhase.SUBMITTING -> LoadingBlock("در حال ثبت در صف…")

                VoicePhase.SUCCESS -> SuccessPhase(
                    state = state,
                    onNextItem = viewModel::nextItem,
                    onScanNext = {
                        viewModel.nextItem()
                        onScanNext()
                    },
                )
            }

            if (state.error != null && state.phase != VoicePhase.PREVIEWING) {
                StatusBanner(
                    text = state.error!!,
                    type = BannerType.Error,
                    modifier = Modifier.padding(top = Dimens.gapLarge),
                )
            }
        }
    }
}

@Composable
private fun ShelfHeader(barcode: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Filled.QrCodeScanner,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(Dimens.icon),
        )
        Text(
            text = "قفسه: $barcode",
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

/** Constant orientation: which step of Speak → Process → Confirm → Done we're on. */
@Composable
private fun PhaseStrip(phase: VoicePhase, modifier: Modifier = Modifier) {
    val (label, type) = when (phase) {
        VoicePhase.INPUT -> "بگویید یا تایپ کنید" to BannerType.Info
        VoicePhase.PREVIEWING -> "در حال پردازش…" to BannerType.Info
        VoicePhase.CONFIRM -> "بررسی و تأیید کنید" to BannerType.Warning
        VoicePhase.SELECT -> "محصول را انتخاب کنید" to BannerType.Warning
        VoicePhase.NOT_FOUND -> "کالا با اطمینان پیدا نشد" to BannerType.Error
        VoicePhase.SUBMITTING -> "در حال ثبت…" to BannerType.Info
        VoicePhase.SUCCESS -> "ثبت شد" to BannerType.Success
    }
    StatusBanner(text = label, type = type, modifier = modifier)
}

@Composable
private fun InputPhase(
    state: VoiceUiState,
    micGranted: Boolean,
    onRequestMic: () -> Unit,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onTranscriptChange: (String) -> Unit,
    onPreview: () -> Unit,
) {
    Text(
        text = "نام کالا و تعداد را بگویید",
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier.padding(bottom = Dimens.gap),
    )

    FilledIconButton(
        onClick = {
            if (!micGranted) onRequestMic()
            else if (state.isListening) onStop() else onStart()
        },
        modifier = Modifier.size(132.dp),
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

    Text(
        text = when {
            state.isListening -> "در حال شنیدن — برای توقف لمس کنید"
            micGranted -> "برای صحبت، دکمه را لمس کنید"
            else -> "برای استفاده از میکروفون، دسترسی را بدهید"
        },
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(top = Dimens.gapSmall),
    )

    if (state.isListening && state.partialText.isNotBlank()) {
        Text(
            text = state.partialText,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.primary,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Dimens.gap),
        )
    }

    OutlinedTextField(
        value = state.transcript,
        onValueChange = onTranscriptChange,
        label = { Text("متن (قابل ویرایش) یا ورود دستی") },
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapLarge),
    )

    PrimaryButton(
        text = "بررسی و ادامه",
        onClick = onPreview,
        enabled = state.transcript.isNotBlank(),
        modifier = Modifier.padding(top = Dimens.gap),
    )
}

@Composable
private fun ConfirmPhase(
    state: VoiceUiState,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    RecognizedText(transcript = state.transcript)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gap),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Dimens.cardPadding),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = state.proposalName,
                style = MaterialTheme.typography.headlineMedium,
                textAlign = TextAlign.Center,
            )
            HorizontalDivider(modifier = Modifier.padding(vertical = Dimens.gap))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                LabeledValue(
                    label = "تعداد",
                    value = state.quantity.toString(),
                    style = MaterialTheme.typography.displayMedium,
                )
                LabeledValue(label = "واحد", value = state.unit ?: "—")
            }
        }
    }
    PrimaryButton(
        text = "تأیید و ثبت",
        onClick = onConfirm,
        icon = Icons.Filled.CheckCircle,
        modifier = Modifier.padding(top = Dimens.gapLarge),
    )
    SecondaryButton(
        text = "لغو",
        onClick = onCancel,
        modifier = Modifier.padding(top = Dimens.gap),
    )
}

@Composable
private fun LabeledValue(
    label: String,
    value: String,
    style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.titleLarge,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = style,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun SelectPhase(
    state: VoiceUiState,
    onSearch: (String) -> Unit,
    onPick: (ProductChoice) -> Unit,
    onCancel: () -> Unit,
    onAddNew: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }

    Text(
        text = state.selectionMessage ?: "محصول را انتخاب کنید",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = Dimens.gap),
    )

    state.choices.forEach { choice -> ChoiceButton(choice, onPick) }

    HorizontalDivider(modifier = Modifier.padding(vertical = Dimens.gapLarge))
    Text("جستجوی محصول", style = MaterialTheme.typography.titleMedium)
    OutlinedTextField(
        value = query,
        onValueChange = {
            query = it
            onSearch(it)
        },
        label = { Text("نام کالا") },
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapSmall),
    )
    PrimaryButton(
        text = "جستجوی کالا",
        onClick = { onSearch(query) },
        enabled = query.isNotBlank(),
        icon = Icons.Filled.Search,
        modifier = Modifier.padding(top = Dimens.gapSmall),
    )
    state.searchResults.forEach { choice -> ChoiceButton(choice, onPick) }

    SecondaryButton(
        text = "+ درخواست افزودن کالای جدید",
        onClick = { onAddNew(query) },
        modifier = Modifier.padding(top = Dimens.gapLarge),
    )
    SecondaryButton(
        text = "لغو",
        onClick = onCancel,
        modifier = Modifier.padding(top = Dimens.gap),
    )
}

@Composable
private fun RecognizedText(transcript: String) {
    if (transcript.isBlank()) return
    Text(
        text = "متن تشخیص داده‌شده",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    )
    Text(
        text = "«$transcript»",
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 2.dp),
    )
}

@Composable
private fun NotFoundPhase(
    state: VoiceUiState,
    onManualSearch: () -> Unit,
    onRetry: () -> Unit,
    onAddNew: () -> Unit,
) {
    Text(
        text = "کالای موردنظر با اطمینان کافی پیدا نشد.",
        style = MaterialTheme.typography.titleMedium,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = Dimens.gap),
    )
    RecognizedText(transcript = state.transcript)
    PrimaryButton(
        text = "جستجوی دستی کالا",
        onClick = onManualSearch,
        icon = Icons.Filled.Search,
        modifier = Modifier.padding(top = Dimens.gapLarge),
    )
    SecondaryButton(
        text = "تلاش مجدد با صدا",
        onClick = onRetry,
        icon = Icons.Filled.Mic,
        modifier = Modifier.padding(top = Dimens.gap),
    )
    SecondaryButton(
        text = "+ درخواست افزودن کالای جدید",
        onClick = onAddNew,
        modifier = Modifier.padding(top = Dimens.gap),
    )
}

@Composable
private fun ChoiceButton(choice: ProductChoice, onPick: (ProductChoice) -> Unit) {
    SecondaryButton(
        text = choice.name + (choice.sku?.let { " ($it)" } ?: ""),
        onClick = { onPick(choice) },
        modifier = Modifier.padding(top = Dimens.gapSmall),
    )
}

@Composable
private fun SuccessPhase(
    state: VoiceUiState,
    onNextItem: () -> Unit,
    onScanNext: () -> Unit,
) {
    Icon(
        imageVector = Icons.Filled.CheckCircle,
        contentDescription = null,
        tint = MaterialTheme.colorScheme.tertiary,
        modifier = Modifier
            .padding(top = Dimens.gap)
            .size(96.dp),
    )
    Text(
        text = state.successText ?: "ثبت شد",
        style = MaterialTheme.typography.titleLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gap),
    )
    PrimaryButton(
        text = "کالای بعدی",
        onClick = onNextItem,
        icon = Icons.Filled.Mic,
        height = Dimens.hugeActionHeight,
        modifier = Modifier.padding(top = Dimens.gapLarge),
    )
    SecondaryButton(
        text = "اسکن قفسه بعدی",
        onClick = onScanNext,
        icon = Icons.Filled.QrCodeScanner,
        modifier = Modifier.padding(top = Dimens.gap),
    )
}

@Composable
private fun LoadingBlock(label: String) {
    com.warehouseos.operator.ui.components.LoadingState(
        label = label,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 48.dp),
    )
}
