package com.warehouseos.operator.ui.screens.worktasks

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.data.local.WorkTaskEntity
import com.warehouseos.operator.data.local.WorkTaskItemEntity
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.EmptyState
import com.warehouseos.operator.ui.components.ErrorState
import com.warehouseos.operator.ui.components.LoadingState

/**
 * «کارهای انبار» — کارهایی که فروشنده/مدیر از POS برای کارگر می‌فرستد.
 *
 * لیست با پیشرفت زنده (`done/total` + نوار سبز) و جزئیات با تیکِ هر قلم.
 * تیک local-first است: قلم محلی DONE می‌شود و ردیف در outbox می‌نشیند — وسطِ روز
 * آفلاین هم کار می‌کند و به محض اتصال به وای‌فای مغازه sync می‌شود. POS همان
 * لحظه پیشرفت را می‌بیند. موجودی اینجا دست نمی‌خورد.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkTasksScreen(
    onBack: () -> Unit,
    viewModel: WorkTasksViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val tasks by viewModel.tasks.collectAsState()
    val snackbarHost = remember { SnackbarHostState() }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbarHost.showSnackbar(it)
            viewModel.clearToast()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.selectedTaskId == null) "کارهای انبار" else "جزئیات کار") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (state.selectedTaskId == null) onBack() else viewModel.select(null)
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "بازگشت")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refresh() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "به‌روزرسانی")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHost) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Dimens.screenPadding),
        ) {
            val selectedId = state.selectedTaskId
            if (selectedId == null) {
                TaskList(
                    tasks = tasks,
                    loading = state.loading,
                    error = state.error,
                    onRetry = { viewModel.refresh(initial = true) },
                    onOpen = viewModel::select,
                )
            } else {
                TaskDetail(
                    taskId = selectedId,
                    viewModel = viewModel,
                )
            }
        }
    }
}

@Composable
private fun TaskList(
    tasks: List<WorkTaskEntity>,
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onOpen: (String) -> Unit,
) {
    when {
        loading && tasks.isEmpty() -> LoadingState(label = "در حال دریافت کارها…")
        error != null && tasks.isEmpty() ->
            ErrorState(message = error!!, onRetry = onRetry)
        tasks.isEmpty() ->
            EmptyState(
                title = "کاری برایتان فرستاده نشده",
                subtitle = "وقتی فروشنده/مدیر فاکتوری را برایتان بفرستد، همین‌جا با پیشرفت نمایش داده می‌شود.",
                icon = Icons.Filled.Assignment,
            )
        else -> {
            if (error != null) {
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(bottom = Dimens.gapSmall),
                )
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                items(tasks, key = { it.id }) { task ->
                    TaskCard(task = task, onClick = { onOpen(task.id) })
                }
            }
        }
    }
}

/** کارت صف: عنوان کار + وضعیت + نوار پیشرفت سبز + «done از total». */
@Composable
private fun TaskCard(
    task: WorkTaskEntity,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (task.status == "COMPLETED") {
                MaterialTheme.colorScheme.surface
            } else {
                MaterialTheme.colorScheme.surfaceContainer
            },
        ),
        onClick = onClick,
    ) {
        Column(modifier = Modifier.padding(Dimens.cardPadding)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = task.title(),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    task.subtitle()?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                }
                StatusChip(status = task.status)
            }

            Spacer(Modifier.height(Dimens.gap))
            TaskProgress(done = task.doneItems, total = task.totalItems)
        }
    }
}

/** نوار پیشرفت سبز + «۳ از ۱۰ آیتم — ۳۰٪». همین مؤلفه در POS هم معنا دارد. */
@Composable
fun TaskProgress(
    done: Int,
    total: Int,
    modifier: Modifier = Modifier,
) {
    val fraction = if (total <= 0) 0f else (done.toFloat() / total).coerceIn(0f, 1f)
    val animated by animateFloatAsState(
        targetValue = fraction,
        animationSpec = tween(durationMillis = 400),
        label = "taskProgress",
    )
    Column(modifier = modifier.fillMaxWidth()) {
        LinearProgressIndicator(
            progress = { animated },
            color = Color(0xFF2E7D32),
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = "${faNum(done)} از ${faNum(total)} آیتم — ${faNum((fraction * 100).toInt())}٪",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun StatusChip(status: String) {
    val (label, color) = when (status) {
        "COMPLETED" -> "تکمیل شده" to Color(0xFF2E7D32)
        "IN_PROGRESS" -> "در جریان" to MaterialTheme.colorScheme.primary
        "CANCELLED" -> "لغو شده" to MaterialTheme.colorScheme.error
        else -> "در انتظار" to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(
        shape = MaterialTheme.shapes.small,
        color = color.copy(alpha = 0.14f),
        contentColor = color,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
        )
    }
}

@Composable
private fun TaskDetail(
    taskId: String,
    viewModel: WorkTasksViewModel,
) {
    val task by remember(taskId) { viewModel.observeTask(taskId) }
        .collectAsState(initial = null)
    val items by remember(taskId) { viewModel.observeItems(taskId) }
        .collectAsState(initial = emptyList())

    if (task == null) {
        LoadingState(label = "در حال دریافت جزئیات…")
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        val t = task!!
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainer,
            ),
        ) {
            Column(modifier = Modifier.padding(Dimens.cardPadding)) {
                Text(
                    text = t.title(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                t.subtitle()?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                Spacer(Modifier.height(Dimens.gap))
                TaskProgress(done = t.doneItems, total = t.totalItems)
            }
        }

        Spacer(Modifier.height(Dimens.gap))

        if (items.isEmpty()) {
            EmptyState(
                title = "قلمی برای این کار نیست",
                subtitle = "اگر کار تازه فرستاده شده، دکمه‌ی به‌روزرسانی را بزنید.",
                icon = Icons.Filled.Assignment,
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(Dimens.gapSmall)) {
                items(items, key = { it.id }) { item ->
                    WorkTaskItemRow(
                        item = item,
                        enabled = t.status != "CANCELLED",
                        onTick = { viewModel.tick(taskId, item.id) },
                    )
                }
            }
        }
    }
}

/** یک قلم کار: تیک بزرگ + کالا + تعداد + آدرس قفسه. زدن تیک = «انجام شد». */
@Composable
private fun WorkTaskItemRow(
    item: WorkTaskItemEntity,
    enabled: Boolean,
    onTick: () -> Unit,
) {
    val done = item.status == "DONE"
    val contentAlpha by animateFloatAsState(
        targetValue = if (done) 0.45f else 1f,
        animationSpec = tween(durationMillis = 250),
        label = "workItemAlpha",
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (done) MaterialTheme.colorScheme.surface
            else MaterialTheme.colorScheme.surfaceContainer,
        ),
        onClick = { if (enabled && !done) onTick() },
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(Dimens.cardPadding),
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .alpha(contentAlpha),
            ) {
                Text(
                    text = item.productName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    textDecoration = if (done) TextDecoration.LineThrough else null,
                )
                Text(
                    text = buildString {
                        append("تعداد: ${faNum(item.quantity)}")
                        item.unit?.takeIf { it.isNotBlank() }?.let { append(" $it") }
                        item.productSku?.takeIf { it.isNotBlank() }?.let { append(" · $it") }
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
                val shelf = item.locationPath?.takeIf { it.isNotBlank() }
                    ?: item.locationName?.takeIf { it.isNotBlank() }
                    ?: item.locationBarcode
                if (shelf != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = 4.dp),
                    ) {
                        Icon(
                            Icons.Filled.Place,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = shelf,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            Box(
                modifier = Modifier.size(48.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (done) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = "انجام شد",
                        tint = Color(0xFF2E7D32),
                        modifier = Modifier.size(Dimens.icon),
                    )
                } else {
                    Checkbox(
                        checked = false,
                        onCheckedChange = { if (enabled) onTick() },
                        enabled = enabled,
                    )
                }
            }
        }
    }
}

/** عنوان کار: شماره فاکتور/پیش‌فاکتور، یا یادداشت، یا «کار انبار». */
private fun WorkTaskEntity.title(): String =
    invoiceNumber?.let { "فاکتور $it" }
        ?: quotationNumber?.let { "پیش‌فاکتور $it" }
        ?: note?.takeIf { it.isNotBlank() }
        ?: "کار انبار"

private fun WorkTaskEntity.subtitle(): String? {
    val parts = buildList {
        requestedByName?.takeIf { it.isNotBlank() }?.let { add("درخواست: $it") }
        note?.takeIf { it.isNotBlank() }?.let { add("«$it»") }
    }
    return parts.joinToString(" · ").ifBlank { null }
}

private const val FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
private fun faNum(n: Int): String =
    n.toString().map { if (it.isDigit()) FA_DIGITS[it - '0'] else it }.joinToString("")
