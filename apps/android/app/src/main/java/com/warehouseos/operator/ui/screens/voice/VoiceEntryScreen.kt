package com.warehouseos.operator.ui.screens.voice

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
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
 * Voice stock-in (propose → confirm), the screen a worker lives in all day.
 *
 * Layout follows the loop, not the feature list: the shelf stays pinned at the
 * top so the worker can never lose track of where they're standing, and the one
 * action for the current step is pinned to the bottom in thumb reach — the phone
 * is held one-handed with a part in the other hand.
 *
 * Saving does NOT open a success screen. It returns straight to a ready mic with
 * a transient notice, because the same shelf usually holds dozens of items.
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
    val pendingPhotos by viewModel.pendingPhotoCount.collectAsState()
    val micPermission = rememberPermissionState(Manifest.permission.RECORD_AUDIO)
    val cameraPermission = rememberPermissionState(Manifest.permission.CAMERA)
    val haptic = LocalHapticFeedback.current

    val takePhoto = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { saved ->
        viewModel.onPhotoCaptured(saved)
    }
    val launchCamera = {
        if (cameraPermission.status.isGranted) {
            takePhoto.launch(viewModel.prepareCapture())
        } else {
            cameraPermission.launchPermissionRequest()
        }
    }

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

    LaunchedEffect(state.lastSaved?.clientRequestId) {
        if (state.lastSaved != null) haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { ShelfTitle(barcode = viewModel.barcode, pendingPhotos = pendingPhotos) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
                    }
                },
                actions = {
                    IconButton(onClick = onScanNext) {
                        Icon(Icons.Filled.QrCodeScanner, contentDescription = "اسکن قفسه بعدی")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        bottomBar = {
            BottomAction(
                state = state,
                onResolve = viewModel::resolveProduct,
                onConfirm = viewModel::confirm,
                onCancel = viewModel::cancelToInput,
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Dimens.screenPadding)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            state.lastSaved?.let { saved ->
                SavedNoticeCard(
                    notice = saved,
                    onUndo = viewModel::undoLastSaved,
                    onDismiss = viewModel::dismissSavedNotice,
                )
            }

            when (state.phase) {
                VoicePhase.INPUT -> InputStep(
                    state = state,
                    micGranted = micPermission.status.isGranted,
                    onRequestMic = { micPermission.launchPermissionRequest() },
                    onStart = viewModel::startListening,
                    onStop = viewModel::stopListening,
                    onTranscriptChange = viewModel::onTranscriptChange,
                )

                VoicePhase.PREVIEWING -> LoadingBlock("در حال جستجو در کاتالوگ گوشی…")

                VoicePhase.CONFIRM -> ConfirmStep(
                    state = state,
                    onInc = viewModel::incQuantity,
                    onDec = viewModel::decQuantity,
                    onAddPhoto = launchCamera,
                    onRemovePhoto = viewModel::removePhoto,
                )

                VoicePhase.SELECT -> SelectStep(
                    state = state,
                    onSearch = viewModel::onSearchQuery,
                    onPick = viewModel::selectChoice,
                    onAddNew = { query -> onRequestNewProduct(prefill(query)) },
                )

                VoicePhase.NOT_FOUND -> NotFoundStep(
                    state = state,
                    onManualSearch = viewModel::searchManually,
                    onRetry = viewModel::cancelToInput,
                    onAddNew = { onRequestNewProduct(prefill(null)) },
                )

                VoicePhase.SUBMITTING -> LoadingBlock("در حال ثبت در صف…")
            }

            state.error?.let { message ->
                if (state.phase != VoicePhase.PREVIEWING) {
                    StatusBanner(
                        text = message,
                        type = BannerType.Error,
                        modifier = Modifier.padding(top = Dimens.gapLarge),
                    )
                }
            }
        }
    }
}

/** Shelf identity stays visible at every step — the costliest mistake is the wrong shelf. */
@Composable
private fun ShelfTitle(barcode: String, pendingPhotos: Int) {
    Column {
        Text(
            text = "قفسه $barcode",
            style = MaterialTheme.typography.titleMedium,
        )
        if (pendingPhotos > 0) {
            Text(
                text = "$pendingPhotos عکس در انتظار وای‌فای",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * One action per step, pinned in thumb reach. NOT_FOUND has none on purpose —
 * its three options are the content, and a fourth button below would compete.
 */
@Composable
private fun BottomAction(
    state: VoiceUiState,
    onResolve: () -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surface) {
        Column(modifier = Modifier.padding(Dimens.screenPadding)) {
            when (state.phase) {
                VoicePhase.INPUT -> PrimaryButton(
                    text = "بررسی و ادامه",
                    onClick = onResolve,
                    enabled = state.transcript.isNotBlank(),
                )

                VoicePhase.CONFIRM -> PrimaryButton(
                    text = "تأیید و ثبت",
                    onClick = onConfirm,
                    icon = Icons.Filled.CheckCircle,
                    height = Dimens.hugeActionHeight,
                )

                VoicePhase.SELECT -> SecondaryButton(
                    text = "برگشت به ضبط صدا",
                    onClick = onCancel,
                    icon = Icons.Filled.Mic,
                )

                VoicePhase.PREVIEWING, VoicePhase.SUBMITTING, VoicePhase.NOT_FOUND -> Unit
            }
        }
    }
}

/**
 * The saved confirmation, with a short undo window. Undo is honest: once the row
 * has synced the notice says so instead of pretending it was reversed.
 */
@Composable
private fun SavedNoticeCard(
    notice: SavedNotice,
    onUndo: () -> Unit,
    onDismiss: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gap),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Dimens.cardPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onTertiaryContainer,
                modifier = Modifier.size(Dimens.icon),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = Dimens.gapSmall),
            ) {
                Text(
                    text = notice.undoResult
                        ?: "${notice.productName} × ${notice.quantity} در صف ثبت شد",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                )
                if (notice.withPhoto && notice.undoResult == null) {
                    Text(
                        text = "عکس هم ضمیمه شد",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                }
            }
            if (notice.undoResult == null) {
                TextButton(onClick = onUndo) { Text("لغو") }
            } else {
                TextButton(onClick = onDismiss) { Text("باشه") }
            }
        }
    }
}

@Composable
private fun InputStep(
    state: VoiceUiState,
    micGranted: Boolean,
    onRequestMic: () -> Unit,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onTranscriptChange: (String) -> Unit,
) {
    Text(
        text = "نام کالا و تعداد را بگویید",
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier.padding(top = Dimens.gapLarge, bottom = Dimens.gap),
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
            state.isListening -> "در حال شنیدن — وقتی حرفتان تمام شد خودکار متوقف می‌شود"
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
            .padding(top = Dimens.gapLarge, bottom = Dimens.gap),
    )
}

@Composable
private fun ConfirmStep(
    state: VoiceUiState,
    onInc: () -> Unit,
    onDec: () -> Unit,
    onAddPhoto: () -> Unit,
    onRemovePhoto: () -> Unit,
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
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center,
            )
            HorizontalDivider(modifier = Modifier.padding(vertical = Dimens.gap))

            // Correctable on the spot: "سه تا" is heard as "سی تا" often enough
            // that forcing a re-record for one wrong digit is unacceptable.
            Text(
                text = "تعداد" + (state.unit?.let { " ($it)" } ?: ""),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Dimens.gapLarge),
                modifier = Modifier.padding(top = Dimens.gapSmall),
            ) {
                StepperButton(label = "−", onClick = onDec)
                Text(
                    text = state.quantity.toString(),
                    style = MaterialTheme.typography.displaySmall,
                )
                StepperButton(label = "+", onClick = onInc)
            }
        }
    }

    // Optional, one tap, never in the way of the main loop.
    val photoPath = state.photoPath
    if (photoPath != null) {
        // Show it back: a blurred or half-framed shot is worse than none, and the
        // worker can only tell by looking before the photo is queued.
        // Decoded once per path and subsampled: a 1600px JPEG would otherwise be
        // decoded in full on the composition thread for a 180dp preview.
        val preview = remember(photoPath) { decodePreview(photoPath) }
        if (preview != null) {
            Image(
                bitmap = preview,
                contentDescription = "عکس گرفته‌شده",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .padding(top = Dimens.gap)
                    .clip(RoundedCornerShape(Dimens.cornerSmall)),
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(Dimens.gapSmall),
            modifier = Modifier.padding(top = Dimens.gapSmall),
        ) {
            SecondaryButton(
                text = "حذف عکس",
                onClick = onRemovePhoto,
                icon = Icons.Filled.Delete,
                modifier = Modifier.weight(1f),
            )
            SecondaryButton(
                text = "عکس دوباره",
                onClick = onAddPhoto,
                icon = Icons.Filled.AddAPhoto,
                modifier = Modifier.weight(1f),
            )
        }
    } else {
        SecondaryButton(
            text = "افزودن عکس (اختیاری)",
            onClick = onAddPhoto,
            icon = Icons.Filled.AddAPhoto,
            modifier = Modifier.padding(top = Dimens.gap),
        )
    }
}

/** Small, cheap decode of the queued photo — null when the file is unreadable. */
private fun decodePreview(path: String): ImageBitmap? = runCatching {
    val options = BitmapFactory.Options().apply { inSampleSize = 4 }
    BitmapFactory.decodeFile(path, options)?.asImageBitmap()
}.getOrNull()

@Composable
private fun StepperButton(label: String, onClick: () -> Unit) {
    FilledTonalIconButton(
        onClick = onClick,
        modifier = Modifier.size(Dimens.buttonHeight),
    ) {
        Text(text = label, style = MaterialTheme.typography.headlineSmall)
    }
}

@Composable
private fun SelectStep(
    state: VoiceUiState,
    onSearch: (String) -> Unit,
    onPick: (ProductChoice) -> Unit,
    onAddNew: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }

    Text(
        text = state.selectionMessage ?: "محصول را انتخاب کنید",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapLarge, bottom = Dimens.gap),
    )

    // کارگر باید ببیند اپ دقیقاً چه شنیده — وقتی چند انتخاب است، تشخیص
    // «درست شنیده شد یا نه» از همین متن ممکن است.
    RecognizedText(transcript = state.transcript)

    state.choices.forEach { choice -> ChoiceButton(choice, onPick) }

    HorizontalDivider(modifier = Modifier.padding(vertical = Dimens.gapLarge))
    OutlinedTextField(
        value = query,
        onValueChange = {
            query = it
            onSearch(it)
        },
        label = { Text("جستجوی نام کالا") },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    state.searchResults.forEach { choice -> ChoiceButton(choice, onPick) }

    SecondaryButton(
        text = "+ درخواست افزودن کالای جدید",
        onClick = { onAddNew(query) },
        modifier = Modifier.padding(top = Dimens.gapLarge, bottom = Dimens.gap),
    )
}

@Composable
private fun RecognizedText(transcript: String) {
    if (transcript.isBlank()) return
    Text(
        text = "متن تشخیص داده‌شده",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gap),
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
private fun NotFoundStep(
    state: VoiceUiState,
    onManualSearch: () -> Unit,
    onRetry: () -> Unit,
    onAddNew: () -> Unit,
) {
    Text(
        text = "این کالا در کاتالوگ گوشی پیدا نشد.",
        style = MaterialTheme.typography.titleMedium,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapLarge, bottom = Dimens.gap),
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
        modifier = Modifier.padding(top = Dimens.gap, bottom = Dimens.gap),
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
private fun LoadingBlock(label: String) {
    com.warehouseos.operator.ui.components.LoadingState(
        label = label,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 48.dp),
    )
}
