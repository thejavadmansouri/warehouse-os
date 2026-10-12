package com.warehouseos.operator.ui.screens.voice

import android.Manifest
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.PhotoCamera
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.KeepScreenOn
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.SecondaryButton
import com.warehouseos.operator.ui.components.StatusBanner
import com.warehouseos.operator.ui.components.faNum
import com.warehouseos.operator.ui.components.rememberOperatorTones
import com.warehouseos.operator.ui.navigation.NewProductPrefill
import com.warehouseos.operator.ui.screens.scan.BarcodeScanner
import kotlinx.coroutines.delay

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
    val tones = rememberOperatorTones()

    KeepScreenOn()

    fun openCamera(forEntryId: String? = null) {
        if (cameraPermission.status.isGranted) {
            viewModel.openCamera(forEntryId)
        } else {
            cameraPermission.launchPermissionRequest()
        }
    }

    fun prefill(nameOverride: String?) = NewProductPrefill(
        barcode = viewModel.barcode,
        name = nameOverride?.takeIf { it.isNotBlank() } ?: state.recognizedName,
        brand = state.recognizedBrand,
        vehicle = state.recognizedVehicle,
        qty = state.quantity,
        unit = state.unit ?: "عدد",
        voice = state.transcript,
        productBarcode = state.unlinkedBarcode.orEmpty(),
    )

    LaunchedEffect(Unit) { viewModel.prewarmMic() }

    LaunchedEffect(state.lastSaved?.clientRequestId) {
        if (state.lastSaved != null) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            tones.success()
            // میکروفون فوری برای کالای بعدی — عکس اختیاری است و حلقه را قطع نمی‌کند.
            if (micPermission.status.isGranted &&
                state.phase == VoicePhase.INPUT &&
                !state.capturingPhoto &&
                !state.scanning
            ) {
                delay(250)
                viewModel.startListening()
            }
        }
    }

    LaunchedEffect(state.error) {
        if (state.error != null) tones.error()
    }

    if (state.capturingPhoto) {
        val attachCount = state.attachingToEntryId?.let { id ->
            state.shelfEntries.find { it.clientRequestId == id }?.photoCount
                ?: state.lastSaved?.takeIf { it.clientRequestId == id }?.photoCount
        }
        StillCameraCapture(
            photoCount = attachCount ?: state.photoPaths.size,
            maxPhotos = VoiceEntryViewModel.MAX_PHOTOS,
            onCaptured = viewModel::onCaptureFile,
            onDone = viewModel::closeCamera,
            createCaptureFile = viewModel::createCaptureFile,
            modifier = Modifier.fillMaxSize(),
        )
        return
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
                    onAddPhoto = { openCamera(saved.clientRequestId) },
                )
            }

            when (state.phase) {
                VoicePhase.INPUT -> if (state.scanning) {
                    BarcodeStep(
                        cameraGranted = cameraPermission.status.isGranted,
                        onRequestCamera = { cameraPermission.launchPermissionRequest() },
                        onBarcode = viewModel::onProductBarcode,
                        onCancel = viewModel::closeScanner,
                    )
                } else {
                    InputStep(
                        state = state,
                        micGranted = micPermission.status.isGranted,
                        onRequestMic = { micPermission.launchPermissionRequest() },
                        onStart = viewModel::startListening,
                        onStop = viewModel::stopListening,
                        onTranscriptChange = viewModel::onTranscriptChange,
                        onScanBarcode = viewModel::openScanner,
                    )
                }

                VoicePhase.PREVIEWING -> LoadingBlock("در حال جستجو در کاتالوگ گوشی…")

                VoicePhase.CONFIRM -> ConfirmStep(
                    state = state,
                    onInc = viewModel::incQuantity,
                    onDec = viewModel::decQuantity,
                    onAddPhoto = { openCamera(null) },
                    onRemovePhoto = viewModel::removePhotoAt,
                )

                VoicePhase.SELECT -> SelectStep(
                    state = state,
                    micGranted = micPermission.status.isGranted,
                    onRequestMic = { micPermission.launchPermissionRequest() },
                    onStartVoiceSearch = viewModel::startListeningForSearch,
                    onStopVoice = viewModel::stopListening,
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
                StatusBanner(
                    text = message,
                    type = BannerType.Error,
                    modifier = Modifier.padding(top = Dimens.gapLarge),
                )
            }

            ShelfEntryList(
                entries = state.shelfEntries,
                onAddPhoto = { id -> openCamera(id) },
            )
        }
    }
}

@Composable
private fun ShelfEntryList(
    entries: List<SavedNotice>,
    onAddPhoto: (String) -> Unit,
) {
    if (entries.isEmpty()) return

    val total = entries.sumOf { it.quantity }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapLarge, bottom = Dimens.gapLarge),
    ) {
        Text(
            text = "ثبت‌های این قفسه (${faNum(entries.size)} کالا، مجموع ${faNum(total)})",
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = Dimens.gapSmall),
        )
        entries.forEach { entry ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = entry.productName,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (entry.photoCount > 0) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(end = Dimens.gapSmall),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.PhotoCamera,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = faNum(entry.photoCount),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 2.dp),
                        )
                    }
                } else if (entry.undoResult == null) {
                    TextButton(onClick = { onAddPhoto(entry.clientRequestId) }) {
                        Text("عکس")
                    }
                }
                Text(
                    text = faNum(entry.quantity),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun ShelfTitle(barcode: String, pendingPhotos: Int) {
    Column {
        Text(
            text = "قفسه $barcode",
            style = MaterialTheme.typography.titleMedium,
        )
        if (pendingPhotos > 0) {
            Text(
                text = "${faNum(pendingPhotos)} عکس در انتظار وای‌فای",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

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

                VoicePhase.PREVIEWING -> PrimaryButton(
                    text = "در حال جستجو…",
                    onClick = {},
                    loading = true,
                )

                VoicePhase.CONFIRM -> PrimaryButton(
                    text = "ثبت ${faNum(state.quantity)} تا",
                    onClick = onConfirm,
                    icon = Icons.Filled.CheckCircle,
                    height = Dimens.hugeActionHeight,
                )

                VoicePhase.SELECT -> SecondaryButton(
                    text = "برگشت به ضبط صدا",
                    onClick = onCancel,
                    icon = Icons.Filled.Mic,
                )

                VoicePhase.SUBMITTING, VoicePhase.NOT_FOUND -> Unit
            }
        }
    }
}

@Composable
private fun SavedNoticeCard(
    notice: SavedNotice,
    onUndo: () -> Unit,
    onDismiss: () -> Unit,
    onAddPhoto: () -> Unit,
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
                        ?: if (notice.commitsDirectly) {
                            "${notice.productName} × ${faNum(notice.quantity)} ثبت شد — لیبل در صف چاپ PC"
                        } else {
                            "${notice.productName} × ${faNum(notice.quantity)} در صف تأیید مدیر ثبت شد"
                        },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                )
                if (notice.photoCount > 0 && notice.undoResult == null) {
                    Text(
                        text = "${faNum(notice.photoCount)} عکس ضمیمه شد",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                }
            }
            if (notice.undoResult == null) {
                if (notice.photoCount == 0) {
                    TextButton(onClick = onAddPhoto) { Text("عکس") }
                }
                TextButton(onClick = onUndo) { Text("لغو") }
            } else {
                TextButton(onClick = onDismiss) { Text("باشه") }
            }
        }
    }
}

@Composable
private fun BarcodeStep(
    cameraGranted: Boolean,
    onRequestCamera: () -> Unit,
    onBarcode: (String) -> Unit,
    onCancel: () -> Unit,
) {
    Text(
        text = "بارکد روی جعبه را مقابل دوربین بگیرید",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapLarge, bottom = Dimens.gap),
    )

    if (cameraGranted) {
        BarcodeScanner(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(4f / 3f)
                .clip(RoundedCornerShape(Dimens.corner))
                .border(
                    width = 3.dp,
                    color = MaterialTheme.colorScheme.primary,
                    shape = RoundedCornerShape(Dimens.corner),
                ),
            onBarcodeDetected = onBarcode,
        )
    } else {
        SecondaryButton(
            text = "اجازه دسترسی به دوربین",
            onClick = onRequestCamera,
            modifier = Modifier.padding(bottom = Dimens.gap),
        )
    }

    SecondaryButton(
        text = "انصراف — با صدا وارد می‌کنم",
        onClick = onCancel,
        modifier = Modifier.padding(top = Dimens.gap),
    )
}

@Composable
private fun InputStep(
    state: VoiceUiState,
    micGranted: Boolean,
    onRequestMic: () -> Unit,
    onStart: () -> Unit,
    onStop: () -> Unit,
    onTranscriptChange: (String) -> Unit,
    onScanBarcode: () -> Unit,
) {
    SecondaryButton(
        text = "اسکن بارکد کالا",
        onClick = onScanBarcode,
        icon = Icons.Filled.QrCodeScanner,
        modifier = Modifier.padding(top = Dimens.gap),
    )

    Text(
        text = "یا نام کالا و تعداد را بگویید",
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
    onRemovePhoto: (Int) -> Unit,
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
                    text = faNum(state.quantity),
                    style = MaterialTheme.typography.displaySmall,
                )
                StepperButton(label = "+", onClick = onInc)
            }
        }
    }

    Text(
        text = "عکس اختیاری است — می‌توانید بعداً هم اضافه کنید",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gap),
        textAlign = TextAlign.Center,
    )

    if (state.photoPaths.isNotEmpty()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(top = Dimens.gapSmall),
            horizontalArrangement = Arrangement.spacedBy(Dimens.gapSmall),
        ) {
            state.photoPaths.forEachIndexed { index, path ->
                val preview = remember(path) { decodePreview(path) }
                Box {
                    if (preview != null) {
                        Image(
                            bitmap = preview,
                            contentDescription = "عکس ${faNum(index + 1)}",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(96.dp)
                                .clip(RoundedCornerShape(Dimens.cornerSmall)),
                        )
                    }
                    IconButton(
                        onClick = { onRemovePhoto(index) },
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .size(28.dp),
                        colors = IconButtonDefaults.iconButtonColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                    ) {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = "حذف عکس",
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }
        }
    }

    val canAddMore = state.photoPaths.size < VoiceEntryViewModel.MAX_PHOTOS
    if (canAddMore) {
        SecondaryButton(
            text = if (state.photoPaths.isEmpty()) {
                "افزودن عکس (اختیاری)"
            } else {
                "عکس بعدی (${faNum(state.photoPaths.size)} از ${faNum(VoiceEntryViewModel.MAX_PHOTOS)})"
            },
            onClick = onAddPhoto,
            icon = Icons.Filled.AddAPhoto,
            modifier = Modifier.padding(top = Dimens.gap),
        )
    }
}

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
    micGranted: Boolean,
    onRequestMic: () -> Unit,
    onStartVoiceSearch: () -> Unit,
    onStopVoice: () -> Unit,
    onSearch: (String) -> Unit,
    onPick: (ProductChoice) -> Unit,
    onAddNew: (String) -> Unit,
) {
    Text(
        text = state.selectionMessage ?: "محصول را انتخاب کنید",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapLarge, bottom = Dimens.gap),
    )

    RecognizedText(transcript = state.transcript)

    state.choices.forEach { choice -> ChoiceButton(choice, onPick) }

    HorizontalDivider(modifier = Modifier.padding(vertical = Dimens.gapLarge))

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = onSearch,
            label = { Text("جستجوی نام کالا") },
            singleLine = true,
            modifier = Modifier.weight(1f),
        )
        FilledIconButton(
            onClick = {
                if (!micGranted) onRequestMic()
                else if (state.isListening) onStopVoice() else onStartVoiceSearch()
            },
            modifier = Modifier
                .padding(start = Dimens.gapSmall)
                .size(56.dp),
            shape = CircleShape,
            colors = if (state.isListening) {
                IconButtonDefaults.filledIconButtonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                )
            } else {
                IconButtonDefaults.filledIconButtonColors()
            },
        ) {
            Icon(
                imageVector = if (state.isListening) Icons.Filled.MicOff else Icons.Filled.Mic,
                contentDescription = if (state.isListening) "توقف" else "گفتن نام کالا",
                modifier = Modifier.size(Dimens.icon),
            )
        }
    }

    if (state.isListening) {
        Text(
            text = state.partialText.ifBlank { "در حال شنیدن…" },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.primary,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = Dimens.gapSmall),
        )
    }

    state.searchResults.forEach { choice -> ChoiceButton(choice, onPick) }

    SecondaryButton(
        text = "+ درخواست افزودن کالای جدید",
        onClick = { onAddNew(state.searchQuery) },
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
