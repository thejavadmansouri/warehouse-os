package com.warehouseos.operator.ui.screens.blankquote

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
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
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.data.local.OutboxEntity
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.SecondaryButton
import com.warehouseos.operator.ui.components.StatusBanner
import com.warehouseos.operator.ui.components.faNum

private val AccentBlank = Color(0xFF0891B2)

/**
 * پیش‌فاکتور سفید — برگه‌ی قیمت از گوشی.
 *
 * صفحه عمداً ساده است: بالای صفحه میکروفن، پایینِ آن فرمِ یک ردیف، و بعد فهرست
 * ردیف‌ها. **هیچ جست‌وجوی کاتالوگ و هیچ دوربینی لازم نیست** — قلمِ برگه‌ی سفید
 * همان متنی است که کارگر می‌گوید، حتی اگر کالا هنوز در سیستم نباشد. قیمت هم
 * اینجا گرفته نمی‌شود مگر به‌عنوان پیشنهاد؛ قیمت‌گذاری کارِ مدیر است.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BlankQuoteScreen(
    onBack: () -> Unit,
    viewModel: BlankQuoteViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("پیش‌فاکتور سفید", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "بازگشت")
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Dimens.screenPadding, vertical = Dimens.gap),
            verticalArrangement = Arrangement.spacedBy(Dimens.gap),
        ) {
            MicPanel(
                listening = state.listening,
                partialText = state.partialText,
                onStart = viewModel::startListening,
                onStop = viewModel::stopListening,
            )

            if (state.notice != null) {
                StatusBanner(
                    text = state.notice.orEmpty(),
                    type = BannerType.Success,
                    icon = Icons.Filled.CloudUpload,
                    onClick = viewModel::dismissNotice,
                )
            }
            if (state.error != null) StatusBanner(state.error.orEmpty(), BannerType.Error)

            DraftRow(
                text = state.draftText,
                quantity = state.draftQuantity,
                price = state.draftPrice,
                onText = viewModel::onDraftText,
                onQuantity = viewModel::onDraftQuantity,
                onPrice = viewModel::onDraftPrice,
                onAdd = viewModel::addDraft,
            )

            LinesSection(lines = state.lines, onRemove = viewModel::removeLine)

            OutlinedTextField(
                value = state.customerName,
                onValueChange = viewModel::onCustomerName,
                label = { Text("نام مشتری (اختیاری)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            PrimaryButton(
                text = if (state.lines.isEmpty()) {
                    "ثبت برگه"
                } else {
                    "ثبت برگه با ${faNum(state.lines.size)} قلم"
                },
                onClick = viewModel::submit,
                loading = state.submitting,
                enabled = state.lines.isNotEmpty(),
                icon = Icons.AutoMirrored.Filled.Send,
            )

            Text(
                "قیمت‌ها را مدیر می‌گذارد؛ عددی که اینجا می‌زنید فقط پیشنهاد است.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            if (state.pendingOfThisDevice.isNotEmpty()) {
                PendingSection(
                    rows = state.pendingOfThisDevice,
                    onDiscard = viewModel::discardPending,
                )
            }
        }
    }
}

@Composable
private fun MicPanel(
    listening: Boolean,
    partialText: String,
    onStart: () -> Unit,
    onStop: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(Dimens.corner),
        color = MaterialTheme.colorScheme.surfaceContainer,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(Dimens.gapLarge),
        ) {
            Surface(
                shape = CircleShape,
                color = if (listening) AccentBlank else AccentBlank.copy(alpha = 0.14f),
                contentColor = if (listening) Color.White else AccentBlank,
            ) {
                IconButton(
                    onClick = { if (listening) onStop() else onStart() },
                    modifier = Modifier.size(Dimens.iconHuge + 24.dp),
                ) {
                    Icon(
                        if (listening) Icons.Filled.Stop else Icons.Filled.Mic,
                        contentDescription = if (listening) "توقف" else "شروع گفتن",
                        modifier = Modifier.size(Dimens.iconLarge),
                    )
                }
            }

            Text(
                text = when {
                    partialText.isNotBlank() -> partialText
                    listening -> "بگویید؛ مثل «سه تا لنت پراید». میکروفن باز می‌ماند تا قلم بعدی."
                    else -> "برای گفتن نام و تعداد، دکمه را بزنید"
                },
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = if (partialText.isNotBlank()) {
                    MaterialTheme.colorScheme.onSurface
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.padding(top = Dimens.gap),
            )
        }
    }
}

@Composable
private fun DraftRow(
    text: String,
    quantity: String,
    price: String,
    onText: (String) -> Unit,
    onQuantity: (String) -> Unit,
    onPrice: (String) -> Unit,
    onAdd: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Dimens.gapSmall)) {
        Text(
            "افزودن دستی",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = text,
            onValueChange = onText,
            label = { Text("نام کالا (هر متنی)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        Row(horizontalArrangement = Arrangement.spacedBy(Dimens.gapSmall)) {
            OutlinedTextField(
                value = quantity,
                onValueChange = onQuantity,
                label = { Text("تعداد") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = price,
                onValueChange = onPrice,
                label = { Text("قیمت پیشنهادی") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.weight(1.4f),
            )
        }

        SecondaryButton("افزودن به فهرست", onAdd, icon = Icons.Filled.Add)
    }
}

@Composable
private fun LinesSection(lines: List<BlankLine>, onRemove: (String) -> Unit) {
    if (lines.isEmpty()) {
        Text(
            "هنوز قلمی اضافه نشده است",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth(),
        )
        return
    }

    Text(
        "اقلام برگه (${faNum(lines.size)})",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.fillMaxWidth(),
    )

    lines.forEach { line ->
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(Dimens.cardPadding),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(line.text, style = MaterialTheme.typography.titleMedium)
                    Text(
                        buildString {
                            append("تعداد ${faNum(line.quantity)}")
                            line.suggestedPrice?.let { append(" · پیشنهاد ${faNum(it)} ریال") }
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = { onRemove(line.key) }) {
                    Icon(Icons.Filled.Delete, "حذف", Modifier.size(Dimens.iconSmall))
                }
            }
        }
    }
}

@Composable
private fun PendingSection(rows: List<OutboxEntity>, onDiscard: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Dimens.gapSmall)) {
        Text(
            "در انتظار ارسال (${faNum(rows.size)})",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth(),
        )

        rows.forEach { row ->
            Surface(
                shape = RoundedCornerShape(Dimens.cornerSmall),
                color = MaterialTheme.colorScheme.surfaceContainer,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                ) {
                    Box(Modifier.weight(1f)) {
                        Column {
                            Text("برگه‌ی سفید", style = MaterialTheme.typography.bodyLarge)
                            Text(
                                row.lastError ?: "به‌محضِ رسیدن به وای‌فای مغازه می‌رود",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    TextButton(onClick = { onDiscard(row.clientRequestId) }) { Text("حذف") }
                }
            }
        }

        Spacer(Modifier.height(0.dp))
    }
}
