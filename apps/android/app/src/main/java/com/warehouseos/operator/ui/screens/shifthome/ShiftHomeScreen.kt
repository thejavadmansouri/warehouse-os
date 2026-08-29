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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SwapHoriz
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.R
import com.warehouseos.operator.data.local.OutboxEntity
import com.warehouseos.operator.data.local.OutboxType
import com.warehouseos.operator.ui.components.ActionCard
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.BrandMark
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.StatusBanner

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShiftHomeScreen(
    onStockIn: () -> Unit,
    onCount: () -> Unit,
    onLocate: () -> Unit,
    onLinkBarcode: () -> Unit,
    onTransfer: () -> Unit,
    onMyWork: () -> Unit,
    onWorkTasks: () -> Unit,
    onSettings: () -> Unit,
    onLogout: () -> Unit,
    viewModel: ShiftHomeViewModel = hiltViewModel(),
) {
    val sessionId by viewModel.sessionId.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val pendingCount by viewModel.pendingCount.collectAsState()
    val pendingPhotoCount by viewModel.pendingPhotoCount.collectAsState()
    val pendingWorkCount by viewModel.pendingWorkCount.collectAsState()
    val failedItems by viewModel.failedItems.collectAsState()
    var showLogoutConfirm by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("خانه اپراتور", fontWeight = FontWeight.Bold) },
                actions = {
                    IconButton(onClick = onSettings) {
                        Icon(Icons.Filled.Settings, "تنظیمات", Modifier.size(Dimens.icon))
                    }
                    IconButton(onClick = { showLogoutConfirm = true }) {
                        Icon(Icons.AutoMirrored.Filled.Logout, "خروج", Modifier.size(Dimens.icon))
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
            GreetingHeader(viewModel.fullName, viewModel.roleLabel)

            if (pendingCount > 0) {
                StatusBanner(
                    text = "${faNum(pendingCount)} عملیات در انتظار ارسال",
                    type = BannerType.Warning,
                    icon = Icons.Filled.CloudUpload,
                    onClick = viewModel::syncNow,
                )
            }
            if (pendingPhotoCount > 0) {
                StatusBanner(
                    text = "${faNum(pendingPhotoCount)} عکس در انتظار وای‌فای مغازه",
                    type = BannerType.Info,
                    icon = Icons.Filled.PhotoCamera,
                )
            }
            if (failedItems.isNotEmpty()) {
                FailedSyncSection(failedItems, viewModel::retryFailed, viewModel::discardFailed)
            }

            if (sessionId == null) {
                NoSessionContent(uiState.isStarting, uiState.error, viewModel::startShift)
            } else {
                ActiveSessionContent(
                    isStarting = uiState.isStarting,
                    onStockIn = onStockIn,
                    onCount = onCount,
                    onLocate = onLocate,
                    onLinkBarcode = onLinkBarcode,
                    onTransfer = onTransfer,
                    onMyWork = onMyWork,
                    onWorkTasks = onWorkTasks,
                    pendingWorkCount = pendingWorkCount,
                    onNewShift = viewModel::startShift,
                )
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
            dismissButton = { TextButton(onClick = { showLogoutConfirm = false }) { Text("انصراف") } },
        )
    }
}

@Composable
private fun GreetingHeader(fullName: String, roleLabel: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.primary,
        ) {
            Box(Modifier.size(52.dp), contentAlignment = Alignment.Center) {
                Text(
                    fullName.trim().firstOrNull()?.uppercase() ?: "؟",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        Column(Modifier.padding(start = Dimens.gap)) {
            Text(
                if (fullName.any { it in 'ا'..'ی' }) "سلام، $fullName" else "سلام",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            if (roleLabel.isNotBlank()) {
                Text(
                    roleLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun NoSessionContent(isStarting: Boolean, error: String?, onStartShift: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(Dimens.corner),
        color = MaterialTheme.colorScheme.surfaceContainer,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(Dimens.gapLarge),
        ) {
            BrandMark(size = Dimens.iconHuge)
            Text(
                "شیفت کاری خود را آغاز کنید",
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Dimens.gap),
            )
            Text(
                "برای شروع ثبت کالا، ابتدا یک شیفت جدید باز کنید",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Dimens.gapSmall, bottom = Dimens.gapLarge),
            )
            PrimaryButton("شروع شیفت", onStartShift, loading = isStarting, icon = Icons.Filled.Add)
        }
    }
    if (error != null) StatusBanner(error, BannerType.Error)
}

private data class HomeAction(
    val title: String,
    val subtitle: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val onClick: () -> Unit,
    val badge: Int? = null,
    val accent: Color? = null,
)

private val AccentPick = Color(0xFF1D4ED8)
private val AccentWork = Color(0xFF7C3AED)
private val AccentCount = Color(0xFFB45309)
private val AccentFind = Color(0xFF0F766E)
private val AccentBarcode = Color(0xFF15803D)
private val AccentMine = Color(0xFF475569)
private val AccentTransfer = Color(0xFFBE185D)

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun ActionGrid(actions: List<HomeAction>, highlightBadged: Boolean) {
    actions.forEach { action ->
        ActionCard(
            title = action.title,
            icon = action.icon,
            onClick = action.onClick,
            subtitle = action.subtitle,
            badge = action.badge,
            accent = action.accent,
            highlighted = highlightBadged && (action.badge ?: 0) > 0,
        )
    }
}

@Composable
private fun ActiveSessionContent(
    isStarting: Boolean,
    onStockIn: () -> Unit,
    onCount: () -> Unit,
    onLocate: () -> Unit,
    onLinkBarcode: () -> Unit,
    onTransfer: () -> Unit,
    onMyWork: () -> Unit,
    onWorkTasks: () -> Unit,
    pendingWorkCount: Int,
    onNewShift: () -> Unit,
) {
    PrimaryButton(
        text = "ثبت ورود کالا",
        onClick = onStockIn,
        icon = Icons.Filled.Add,
        height = Dimens.hugeActionHeight,
    )

    Spacer(Modifier.height(Dimens.gapSmall))
    SectionLabel(if (pendingWorkCount > 0) "کارهای فوری" else "کارهای ارجاعی")
    ActionGrid(
        listOf(
            HomeAction(
                "کارهای انبار",
                if (pendingWorkCount > 0) "${faNum(pendingWorkCount)} کار در جریان" else "برداشتن و چیدن کالا",
                Icons.Filled.Assignment,
                onWorkTasks,
                pendingWorkCount,
                AccentWork,
            ),
        ),
        highlightBadged = true,
    )

    SectionLabel("ابزارهای انبار")
    ActionGrid(
        listOf(
            HomeAction("انبارگردانی", "شمارش موجودی", Icons.Filled.Checklist, onCount, accent = AccentCount),
            HomeAction("یافتن کالا", "آدرس دقیق قفسه", Icons.Filled.Search, onLocate, accent = AccentFind),
            HomeAction("اتصال بارکد", "اتصال بارکد جعبه به کالا", Icons.Filled.QrCodeScanner, onLinkBarcode, accent = AccentBarcode),
            HomeAction("انتقال بین قفسه", "جابه‌جایی موجودی", Icons.Filled.SwapHoriz, onTransfer, accent = AccentTransfer),
            HomeAction("کارهای من", "ثبت‌ها و تأییدها", Icons.Filled.History, onMyWork, accent = AccentMine),
        ),
        highlightBadged = false,
    )

    TextButton(
        onClick = onNewShift,
        enabled = !isStarting,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("شروع شیفت جدید") }
}

@Composable
private fun FailedSyncSection(
    items: List<OutboxEntity>,
    onRetry: (OutboxEntity) -> Unit,
    onDiscard: (OutboxEntity) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Dimens.gapSmall)) {
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
                    modifier = Modifier.padding(Dimens.cardPadding),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(item.label(), fontWeight = FontWeight.SemiBold)
                        Text(item.lastError ?: "خطای نامشخص", style = MaterialTheme.typography.bodySmall)
                    }
                    IconButton(onClick = { onRetry(item) }) {
                        Icon(Icons.Filled.Refresh, "تلاش دوباره", Modifier.size(Dimens.iconSmall))
                    }
                    IconButton(onClick = { onDiscard(item) }) {
                        Icon(Icons.Filled.Delete, "حذف", Modifier.size(Dimens.iconSmall))
                    }
                }
            }
        }
    }
}

private const val FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
private fun faNum(n: Int): String = n.toString().map { if (it.isDigit()) FA_DIGITS[it - '0'] else it }.joinToString("")

private fun OutboxEntity.label(): String {
    val where = locationBarcode.takeIf { it.isNotBlank() }?.let { " · قفسه $it" } ?: ""
    return when (type) {
        OutboxType.NEW_PRODUCT_REQUEST -> "درخواست کالای جدید$where"
        OutboxType.IN -> "ثبت کالا$where"
        OutboxType.COUNT -> "انبارگردانی$where"
        OutboxType.WORK_TASK_TICK -> "تیک کار انبار"
        else -> "عملیات$where"
    }
}
