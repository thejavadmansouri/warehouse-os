package com.warehouseos.operator.ui.screens.voice

import android.Manifest
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState

/**
 * Voice stock-in (propose → confirm). Speaks/types → backend preview proposes a
 * product (no commit) → worker confirms → commit. Basic visuals; feature-complete
 * flow including the ambiguous-match selection + manual search path.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalPermissionsApi::class)
@Composable
fun VoiceEntryScreen(
    onBack: () -> Unit,
    onScanNext: () -> Unit,
    viewModel: VoiceEntryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val micPermission = rememberPermissionState(Manifest.permission.RECORD_AUDIO)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ثبت صوتی کالا") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "قفسه: ${viewModel.barcode}",
                style = MaterialTheme.typography.titleLarge,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

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

                VoicePhase.PREVIEWING -> LoadingBlock("در حال بررسی…")

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
                )

                VoicePhase.SUBMITTING -> LoadingBlock("در حال ثبت…")

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
                Text(
                    text = state.error!!,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                )
            }
        }
    }
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
        modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
    )

    FilledIconButton(
        onClick = {
            if (!micGranted) onRequestMic()
            else if (state.isListening) onStop() else onStart()
        },
        modifier = Modifier.size(120.dp),
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
            modifier = Modifier.size(52.dp),
        )
    }

    if (state.isListening && state.partialText.isNotBlank()) {
        Text(
            text = state.partialText,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.primary,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
        )
    }

    OutlinedTextField(
        value = state.transcript,
        onValueChange = onTranscriptChange,
        label = { Text("متن (قابل ویرایش) یا وارد کردن دستی") },
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp),
    )

    Button(
        onClick = onPreview,
        enabled = state.transcript.isNotBlank(),
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(top = 12.dp),
    ) { Text("بررسی و ادامه") }
}

@Composable
private fun ConfirmPhase(
    state: VoiceUiState,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    Text(
        text = "گفته‌ی شما: ${state.transcript}",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp),
    )
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(state.proposalName, style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
            Text(
                text = "تعداد: ${state.quantity}${state.unit?.let { " $it" } ?: ""}",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
    Button(
        onClick = onConfirm,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(top = 16.dp),
    ) { Text("تأیید و ثبت") }
    OutlinedButton(
        onClick = onCancel,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(top = 8.dp),
    ) { Text("لغو") }
}

@Composable
private fun SelectPhase(
    state: VoiceUiState,
    onSearch: (String) -> Unit,
    onPick: (ProductChoice) -> Unit,
    onCancel: () -> Unit,
) {
    var query by remember { mutableStateOf("") }

    Text(
        text = state.selectionMessage ?: "محصول را انتخاب کنید",
        style = MaterialTheme.typography.bodyLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp, bottom = 8.dp),
    )

    state.choices.forEach { choice -> ChoiceButton(choice, onPick) }

    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
    Text("جستجوی محصول", style = MaterialTheme.typography.bodyLarge)
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
            .padding(top = 8.dp),
    )
    state.searchResults.forEach { choice -> ChoiceButton(choice, onPick) }

    OutlinedButton(
        onClick = onCancel,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(top = 16.dp),
    ) { Text("لغو") }
}

@Composable
private fun ChoiceButton(choice: ProductChoice, onPick: (ProductChoice) -> Unit) {
    Button(
        onClick = { onPick(choice) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
    ) {
        Text(choice.name + (choice.sku?.let { " ($it)" } ?: ""))
    }
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
        tint = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .padding(top = 24.dp)
            .size(72.dp),
    )
    Text(
        text = state.successText ?: "ثبت شد",
        style = MaterialTheme.typography.titleLarge,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp),
    )
    Button(
        onClick = onNextItem,
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            .padding(top = 24.dp),
    ) { Text("کالای بعدی", style = MaterialTheme.typography.titleLarge) }
    OutlinedButton(
        onClick = onScanNext,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(top = 12.dp),
    ) { Text("اسکن قفسه بعدی") }
}

@Composable
private fun LoadingBlock(label: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Text(text = label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 16.dp))
    }
}
