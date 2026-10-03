package com.warehouseos.operator.ui.screens.mywork

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.data.remote.dto.MyWorkItem
import com.warehouseos.operator.data.remote.dto.MyWorkSummary
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.ErrorState
import com.warehouseos.operator.ui.components.LoadingState

/**
 * «کارهای من» — کارگر می‌بیند چه ثبت کرده و مدیر چه تصمیمی گرفته.
 *
 * بازخوردِ رد شدن مهم است: اگر کارگر نداند کارش رد شده و چرا، همان اشتباه را
 * تکرار می‌کند.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyWorkScreen(
    onBack: () -> Unit,
    viewModel: MyWorkViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("کارهای من") },
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
                .padding(Dimens.screenPadding),
        ) {
            when {
                state.loading -> LoadingState()
                state.error != null -> ErrorState(message = state.error!!, onRetry = viewModel::load)
                else -> {
                    SummaryRow(state.summary)
                    if (state.items.isEmpty()) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                "امروز هنوز کاری ثبت نکرده‌اید",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                            modifier = Modifier.padding(top = Dimens.gap),
                        ) {
                            items(state.items, key = { it.id }) { WorkRow(it) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(s: MyWorkSummary) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Dimens.gap),
    ) {
        Stat("ثبت‌شده", s.total, MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
        Stat("تأیید", s.approved, ApprovedGreen, Modifier.weight(1f))
        Stat("در انتظار", s.pending, PendingAmber, Modifier.weight(1f))
        Stat("رد", s.rejected, RejectedRed, Modifier.weight(1f))
    }
}

@Composable
private fun Stat(label: String, value: Int, color: Color, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(faNum(value), color = color, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun WorkRow(item: MyWorkItem) {
    val (label, color) = when (item.status) {
        "APPROVED" -> "تأیید شد" to ApprovedGreen
        "REJECTED" -> "رد شد" to RejectedRed
        else -> "در انتظار" to PendingAmber
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(Dimens.gap)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = item.productName ?: item.voiceText ?: "—",
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f),
                )
                // برچسب وضعیت: رنگ + متن، نه فقط رنگ (نور بد + کوررنگی)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(color.copy(alpha = 0.12f))
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                ) {
                    Text(label, color = color, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
            }

            Text(
                text = "تعداد: ${faNum(item.quantity)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )

            // دلیل رد شدن — مهم‌ترین بخش برای کارگر.
            if (item.status == "REJECTED" && !item.reviewNote.isNullOrBlank()) {
                Text(
                    text = "دلیل: ${item.reviewNote}",
                    style = MaterialTheme.typography.bodySmall,
                    color = RejectedRed,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

// رنگ‌های وضعیت — همان پالت طراحی (سبز موفق، کهربایی هشدار، قرمز خطا).
private val ApprovedGreen = Color(0xFF1A9951)
private val PendingAmber = Color(0xFFD97706)
private val RejectedRed = Color(0xFFE30117)

private const val FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
private fun faNum(n: Int): String =
    n.toString().map { if (it.isDigit()) FA_DIGITS[it - '0'] else it }.joinToString("")
