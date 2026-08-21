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
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import com.warehouseos.operator.data.local.OutboxEntity
import com.warehouseos.operator.data.local.OutboxType
import com.warehouseos.operator.ui.components.ActionCard
import com.warehouseos.operator.ui.components.BrandMark
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
    onWorkTasks: () -> Unit,
    onSettings: () -> Unit,
    onLogout: () -> Unit,
    viewModel: ShiftHomeViewModel = hiltViewModel(),
) {
    val sessionId by viewModel.sessionId.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val pendingCount by viewModel.pendingCount.collectAsState()
    val pendingPhotoCount by viewModel.pendingPhotoCount.collectAsState()
    val pendingPickCount by viewModel.pendingPickCount.collectAsState()
    val pendingWorkCount by viewModel.pendingWorkCount.collectAsState()
    val failedItems by viewModel.failedItems.collectAsState()
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

            // Photos are Wi-Fi-only, so they can legitimately sit while operations
            // sync over mobile data. Naming the reason stops it reading as "stuck".
            if (pendingPhotoCount > 0) {
                StatusBanner(
                    text = "$pendingPhotoCount عکس در انتظار وای‌فای مغازه",
                    type = BannerType.Info,
                    icon = Icons.Filled.PhotoCamera,
                    modifier = Modifier.padding(top = Dimens.gapSmall),
                )
            }

            // Scrollable: the action grid plus the greeting, sync banner and primary
            // CTA overflow a short phone, and without this the last row and the
            // "شروع شیفت جدید" button are silently clipped off the bottom.
            //
            // Top-aligned, NOT centered: centering inside a scrolling column makes
            // the content jump as banners appear and disappear, and on a short
            // phone it pushes the primary CTA below the fold on first paint.
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (failedItems.isNotEmpty()) {
                    FailedSyncSection(
                        items = failedItems,
                        onRetry = viewModel::retryFailed,
                        onDiscard = viewModel::discardFailed,
                    )
                }

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
                        onWorkTasks = onWorkTasks,
                        pendingPickCount = pendingPickCount,
                        pendingWorkCount = pendingWorkCount,
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
            BrandMark(size = Dimens.iconHuge)
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

/**
 * One home action. A data class rather than nested Pair/Triple so the subtitle
 * travels with its card — the previous version looked the subtitle up by
 * matching on the Persian title, which silently broke on any label change.
 */
private data class HomeAction(
    val title: String,
    val subtitle: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val onClick: () -> Unit,
    val badge: Int? = null,
)

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = Dimens.gapSmall),
    )
}

@Composable
private fun ActionGrid(actions: List<HomeAction>, highlightBadged: Boolean) {
    actions.chunked(2).forEach { row ->
        Row(
            horizontalArrangement = Arrangement.spacedBy(Dimens.gap),
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = Dimens.gap),
        ) {
            row.forEach { action ->
                ActionCard(
                    title = action.title,
                    icon = action.icon,
                    onClick = action.onClick,
                    subtitle = action.subtitle,
                    badge = action.badge,
                    highlighted = highlightBadged && (action.badge ?: 0) > 0,
                    modifier = Modifier.weight(1f),
                )
            }
            // Odd count → empty spacer keeps the row's card widths even.
            if (row.size == 1) Spacer(Modifier.weight(1f))
        }
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
    onWorkTasks: () -> Unit,
    pendingPickCount: Int,
    pendingWorkCount: Int,
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

    // Split by who is waiting, not by feature. Work someone else queued for this
    // worker is time-sensitive and goes first; the tools they reach for on their
    // own initiative sit below. A flat grid of six equal cards made an idle
    // "یافتن کالا" look as urgent as five picks a seller is standing there for.
    val waiting = buildList {
        add(
            HomeAction(
                title = "کار برداشت",
                subtitle = if (pendingPickCount > 0) {
                    "${faNum(pendingPickCount)} کالا در انتظار"
                } else {
                    "کالاهای درخواستی فروشنده"
                },
                icon = Icons.Filled.Inventory2,
                onClick = onPickTasks,
                badge = pendingPickCount,
            ),
        )
        add(
            HomeAction(
                title = "کارهای انبار",
                subtitle = if (pendingWorkCount > 0) {
                    "${faNum(pendingWorkCount)} کار در جریان"
                } else {
                    // دیگر فقط از POS نمی‌آید: چیدنِ کالای فاکتور خرید هم همین‌جاست.
                    "برداشتن و چیدن کالا"
                },
                icon = Icons.Filled.Assignment,
                onClick = onWorkTasks,
                badge = pendingWorkCount,
            ),
        )
    }

    val tools = buildList {
        add(HomeAction("انبارگردانی", "شمارش موجودی", Icons.Filled.Checklist, onCount))
        add(HomeAction("یافتن کالا", "آدرس دقیق قفسه", Icons.Filled.Search, onLocate))
        if (onSell != null) {
            add(HomeAction("فروش کالا", "ثبت فروش از انبار", Icons.Filled.ShoppingCart, onSell))
        }
        add(HomeAction("کارهای من", "ثبت‌ها و تأییدها", Icons.Filled.History, onMyWork))
    }

    SectionLabel(
        text = if (waiting.any { (it.badge ?: 0) > 0 }) "در انتظار شما" else "کارهای ارجاعی",
    )
    ActionGrid(actions = waiting, highlightBadged = true)

    SectionLabel(text = "ابزارها")
    ActionGrid(actions = tools, highlightBadged = false)

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

/**
 * ردیف‌هایی که سرور رد کرده (FAILED). بدون این بخش، یک خطای دائمی بی‌صدا
 * هرگز ثبت نمی‌شود و کارگر فکر می‌کند کارش انجام شده. هر ردیف پیام خطای
 * سرور + دکمه‌های «تلاش دوباره» و «حذف» دارد.
 */
@Composable
private fun FailedSyncSection(
    items: List<OutboxEntity>,
    onRetry: (OutboxEntity) -> Unit,
    onDiscard: (OutboxEntity) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = Dimens.gapLarge),
        verticalArrangement = Arrangement.spacedBy(Dimens.gapSmall),
    ) {
        StatusBanner(
            text = "${faNum(items.size)} مورد در ارسال با خطا مواجه شد",
            type = BannerType.Error,
            icon = Icons.Filled.ErrorOutline,
        )
        items.forEach { item ->
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(start = Dimens.cardPadding, end = Dimens.gapSmall, top = Dimens.gapSmall, bottom = Dimens.gapSmall),
                ) {
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(end = Dimens.gapSmall),
                    ) {
                        Text(
                            text = item.label(),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = item.lastError ?: "خطای نامشخص",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    IconButton(onClick = { onRetry(item) }) {
                        Icon(
                            Icons.Filled.Refresh,
                            contentDescription = "تلاش دوباره",
                            modifier = Modifier.size(Dimens.iconSmall),
                        )
                    }
                    IconButton(onClick = { onDiscard(item) }) {
                        Icon(
                            Icons.Filled.Delete,
                            contentDescription = "حذف",
                            modifier = Modifier.size(Dimens.iconSmall),
                        )
                    }
                }
            }
        }
    }
}

/** برچسب فارسیِ کوتاه برای یک ردیف صف — بر اساس نوع عملیات. */
private fun OutboxEntity.label(): String {
    val shelf = locationBarcode.takeIf { it.isNotBlank() }
    val where = shelf?.let { " · قفسه $it" } ?: ""
    return when (type) {
        OutboxType.NEW_PRODUCT_REQUEST -> "درخواست کالای جدید$where"
        OutboxType.IN -> "ثبت کالا$where"
        OutboxType.COUNT -> "انبارگردانی$where"
        OutboxType.WORK_TASK_TICK -> "تیک کار انبار"
        else -> "عملیات$where"
    }
}
