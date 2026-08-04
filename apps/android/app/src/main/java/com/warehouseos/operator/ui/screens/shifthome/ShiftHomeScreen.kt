package com.warehouseos.operator.ui.screens.shifthome

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Warehouse
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.R
import com.warehouseos.operator.ui.components.ActionCard
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.StatusBanner

/**
 * Shift home — the operator hub. No active session → a single "start shift"
 * action; active session → a big primary CTA plus a 2-column grid of actions.
 * The «کار برداشت» card carries a live badge of pending tasks, and the whole
 * grid is sized and animated for gloved hands on the warehouse floor.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShiftHomeScreen(
    onStockIn: () -> Unit,
    onCount: () -> Unit,
    onSell: (() -> Unit)? = null,
    onLocate: () -> Unit,
    onMyWork: () -> Unit,
    onPickTasks: () -> Unit,
    onSettings: () -> Unit,
    onLogout: () -> Unit,
    viewModel: ShiftHomeViewModel = hiltViewModel(),
) {
    val sessionId by viewModel.sessionId.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val pendingCount by viewModel.pendingCount.collectAsState()
    val pendingPickCount by viewModel.pendingPickCount.collectAsState()
    var showLogoutConfirm by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.customer_name)) },
                actions = {
                    IconButton(onClick = onSettings) {
                        Icon(
                            Icons.Filled.Settings,
                            contentDescription = "تنظیمات",
                            modifier = Modifier.size(Dimens.icon),
                        )
                    }
                    IconButton(onClick = { showLogoutConfirm = true }) {
                        Icon(
                            Icons.AutoMirrored.Filled.Logout,
                            contentDescription = "خروج",
                            modifier = Modifier.size(Dimens.icon),
                        )
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
            GreetingHeader(
                fullName = viewModel.fullName,
                roleLabel = viewModel.roleLabel,
            )

            if (pendingCount > 0) {
                StatusBanner(
                    text = "$pendingCount مورد در انتظار همگام‌سازی — برای ارسال لمس کنید",
                    type = BannerType.Warning,
                    icon = Icons.Filled.CloudUpload,
                    onClick = viewModel::syncNow,
                    modifier = Modifier.padding(top = Dimens.gap),
                )
            }

            // Scrollable: the action grid plus the greeting, sync banner and primary
            // CTA overflow a short phone, and without this the last row and the
            // "شروع شیفت جدید" button are silently clipped off the bottom.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                if (sessionId == null) {
                    NoSessionContent(
                        isStarting = uiState.isStarting,
                        error = uiState.error,
                        onStartShift = viewModel::startShift,
                    )
                } else {
                    ActiveSessionContent(
                        isStarting = uiState.isStarting,
                        onStockIn = onStockIn,
                        onCount = onCount,
                        onSell = if (viewModel.isManager) onSell else null,
                        onLocate = onLocate,
                        onMyWork = onMyWork,
                        onPickTasks = onPickTasks,
                        pendingPickCount = pendingPickCount,
                        onNewShift = viewModel::startShift,
                    )
                }
            }
        }
    }

    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = { Text("خروج از حساب") },
            text = { Text("آیا از خروج مطمئن هستید؟ شیفت جاری بسته می‌شود.") },
            confirmButton = {
                TextButton(onClick = {
                    showLogoutConfirm = false
                    viewModel.logout()
                    onLogout()
                }) { Text("خروج") }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutConfirm = false }) { Text("انصراف") }
            },
        )
    }
}

@Composable
private fun GreetingHeader(
    fullName: String,
    roleLabel: String,
) {
    if (fullName.isBlank()) return

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        // Avatar — initial letter in a tinted circle.
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.primary,
        ) {
            Box(
                modifier = Modifier.size(52.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = fullName.trim().firstOrNull()?.uppercase() ?: "؟",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        Column(modifier = Modifier.padding(start = Dimens.gap)) {
            Text(
                text = "سلام، $fullName",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            if (roleLabel.isNotBlank()) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ) {
                    Text(
                        text = roleLabel,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                    )
                }
            }
        }
    }
    Spacer(Modifier.height(Dimens.gapLarge))
}

@Composable
private fun NoSessionContent(
    isStarting: Boolean,
    error: String?,
    onStartShift: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(Dimens.corner),
        color = MaterialTheme.colorScheme.surfaceContainer,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(Dimens.gapLarge * 2),
        ) {
            Icon(
                Icons.Filled.Warehouse,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(Dimens.iconHuge),
            )
            Text(
                text = "شیفت کاری خود را آغاز کنید",
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Dimens.gap),
            )
            Text(
                text = "برای شروع ثبت کالا، ابتدا یک شیفت جدید باز کنید",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Dimens.gapSmall, bottom = Dimens.gapLarge),
            )
            PrimaryButton(
                text = "شروع شیفت",
                onClick = onStartShift,
                loading = isStarting,
                icon = Icons.Filled.Add,
            )
        }
    }
    if (error != null) {
        StatusBanner(
            text = error,
            type = BannerType.Error,
            modifier = Modifier.padding(top = Dimens.gap),
        )
    }
}

@Composable
private fun ActiveSessionContent(
    isStarting: Boolean,
    onStockIn: () -> Unit,
    onCount: () -> Unit,
    onSell: (() -> Unit)?,
    onLocate: () -> Unit,
    onMyWork: () -> Unit,
    onPickTasks: () -> Unit,
    pendingPickCount: Int,
    onNewShift: () -> Unit,
) {
    StatusBanner(
        text = "شیفت فعال است — آماده‌ی ثبت کالا",
        type = BannerType.Success,
        modifier = Modifier.padding(bottom = Dimens.gapLarge),
    )

    // Primary CTA stays the biggest thing on screen.
    PrimaryButton(
        text = "ثبت ورود کالا",
        onClick = onStockIn,
        icon = Icons.Filled.Add,
        height = Dimens.hugeActionHeight,
    )
    Spacer(Modifier.height(Dimens.gapLarge))

    // 2-column grid of secondary actions. The pick-task card glows and carries a
    // badge when work is waiting.
    val cards = buildList {
        add(
            Triple(
                "کار برداشت",
                Icons.Filled.Inventory2,
                onPickTasks,
            ) to (pendingPickCount to true),
        )
        add(Triple("انبارگردانی", Icons.Filled.Checklist, onCount) to (null to false))
        if (onSell != null) {
            add(Triple("فروش کالا", Icons.Filled.ShoppingCart, onSell) to (null to false))
        }
        add(Triple("یافتن کالا", Icons.Filled.Search, onLocate) to (null to false))
        add(Triple("کارهای من", Icons.Filled.History, onMyWork) to (null to false))
    }

    cards.chunked(2).forEach { row ->
        Row(
            horizontalArrangement = Arrangement.spacedBy(Dimens.gap),
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = Dimens.gap),
        ) {
            row.forEach { (card, badgeInfo) ->
                val badge = badgeInfo.first
                val highlighted = badgeInfo.second && (badge ?: 0) > 0
                ActionCard(
                    title = card.first,
                    icon = card.second,
                    onClick = card.third,
                    subtitle = when (card.first) {
                        "کار برداشت" ->
                            if ((badge ?: 0) > 0) "${faNum(badge!!)} کالا در انتظار"
                            else "کالاهای درخواستی فروشنده"
                        "انبارگردانی" -> "شمارش موجودی"
                        "فروش کالا" -> "ثبت فروش از انبار"
                        "یافتن کالا" -> "آدرس دقیق قفسه"
                        else -> "ثبت‌ها و تأییدها"
                    },
                    badge = badge,
                    highlighted = highlighted,
                    modifier = Modifier.weight(1f),
                )
            }
            // Odd count → empty spacer keeps the row's card widths even.
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
    }

    TextButton(
        onClick = onNewShift,
        enabled = !isStarting,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Dimens.gapSmall),
    ) {
        Text(
            text = "شروع شیفت جدید",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private const val FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
private fun faNum(n: Int): String =
    n.toString().map { if (it.isDigit()) FA_DIGITS[it - '0'] else it }.joinToString("")
