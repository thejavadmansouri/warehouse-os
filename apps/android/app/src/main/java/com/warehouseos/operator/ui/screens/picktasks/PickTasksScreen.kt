package com.warehouseos.operator.ui.screens.picktasks

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.warehouseos.operator.data.notifications.PickAlertGate
import com.warehouseos.operator.data.remote.dto.PickTaskDto
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.EmptyState
import com.warehouseos.operator.ui.components.ErrorState
import com.warehouseos.operator.ui.components.LoadingState

/**
 * «کار برداشت» — کارگر آدرس دقیق قفسه + کالا + تعداد را می‌بیند، جنس را برمی‌دارد
 * و تیک می‌زند.
 *
 * قلم‌های در انتظار **بر اساس قفسه گروه‌بندی** شده‌اند: کارگر اول سراغ قفسه‌ای
 * می‌رود که بیشترین قلم را دارد و با یک تپِ بزرگِ «همه را آوردم» کل آن قفسه را
 * ثبت می‌کند — با دستکش و بدون اسکرولِ اضافه. قلم‌های برداشته‌شده کم‌رنگ پایین
 * لیست می‌مانند تا کارگر جای خودش را گم نکند.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PickTasksScreen(
    onBack: () -> Unit,
    viewModel: PickTasksViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHost = remember { SnackbarHostState() }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbarHost.showSnackbar(it)
            viewModel.clearToast()
        }
    }

    // While this screen is visible the queue updates itself every few seconds —
    // tell the watcher service not to ring over it. The gate is tied to the
    // ACTIVITY lifecycle, not just composition: pressing Home must re-enable
    // ringing, or the worker would miss alerts with the phone in their pocket.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> PickAlertGate.pickScreenVisible = true
                Lifecycle.Event.ON_STOP -> PickAlertGate.pickScreenVisible = false
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            PickAlertGate.pickScreenVisible = false
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("کار برداشت") },
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
        snackbarHost = { SnackbarHost(snackbarHost) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(Dimens.screenPadding),
        ) {
            when {
                state.loading -> LoadingState()
                state.error != null && state.items.isEmpty() ->
                    ErrorState(message = state.error!!, onRetry = viewModel::load)
                state.items.isEmpty() ->
                    EmptyState(
                        title = "کار برداشتی ندارید",
                        subtitle = "وقتی فروشنده کالایی برایتان بفرستد، همین‌جا نمایش داده می‌شود.",
                        icon = Icons.Filled.Inventory2,
                    )
                else -> PickList(state, viewModel)
            }
        }
    }
}

@Composable
private fun PickList(
    state: PickTasksUiState,
    viewModel: PickTasksViewModel,
) {
    val pending = state.items.filter { it.status == "PENDING" }
    val picked = state.items.filter { it.status == "PICKED" }

    // گروه‌بندی قلم‌های در انتظار بر اساس قفسه — ترتیبِ اولین دیده‌شدن حفظ می‌شود.
    val grouped = pending.groupBy { it.location?.id ?: NO_LOCATION_KEY }
    val doneCount = picked.size
    val totalCount = state.items.size

    Text(
        text = buildString {
            append("${faNum(pending.size)} قلم مانده")
            if (doneCount > 0) append(" — ${faNum(doneCount)} از ${faNum(totalCount)} آورده شد")
        },
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = Dimens.gap),
    )

    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(Dimens.gap),
    ) {
        grouped.forEach { (locationId, tasks) ->
            item(key = "loc-$locationId") {
                LocationGroupHeader(
                    tasks = tasks,
                    busy = tasks.any { it.id in state.pickingIds },
                    onPickAll = { viewModel.markAllAtLocation(locationId) },
                )
            }
            items(tasks, key = { it.id }) { task ->
                PickTaskRow(
                    task = task,
                    busy = task.id in state.pickingIds,
                    onPicked = { viewModel.markPicked(task.id) },
                    modifier = Modifier.animateItem(),
                )
            }
        }

        if (picked.isNotEmpty()) {
            item(key = "picked-header") {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = Dimens.gapSmall),
                ) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(Dimens.iconSmall),
                    )
                    Spacer(Modifier.width(Dimens.gapSmall))
                    Text(
                        text = "برده‌شده‌ها",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(picked, key = { it.id }) { task ->
                PickTaskRow(
                    task = task,
                    busy = task.id in state.pickingIds,
                    onPicked = { viewModel.markPicked(task.id) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }
}

/** سربرگ هر قفسه: آدرس + تعداد قلم + یک تپِ بزرگ برای کل قفسه. */
@Composable
private fun LocationGroupHeader(
    tasks: List<PickTaskDto>,
    busy: Boolean,
    onPickAll: () -> Unit,
) {
    val first = tasks.first()
    val shelf = first.location?.path?.takeIf { it.isNotBlank() }
        ?: first.location?.name?.takeIf { it.isNotBlank() }
        ?: first.location?.code
        ?: "قفسه"

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(Dimens.cardPadding),
        ) {
            Icon(
                Icons.Filled.Place,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(Dimens.icon),
            )
            Spacer(Modifier.width(Dimens.gap))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = shelf,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = "${faNum(tasks.size)} قلم در این قفسه",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            FilledTonalButton(
                onClick = onPickAll,
                enabled = !busy,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    horizontal = 14.dp,
                    vertical = 10.dp,
                ),
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(
                        Icons.Filled.DoneAll,
                        contentDescription = null,
                        modifier = Modifier.size(Dimens.iconSmall),
                    )
                }
                Spacer(Modifier.width(6.dp))
                Text("همه را آوردم", style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

@Composable
private fun PickTaskRow(
    task: PickTaskDto,
    busy: Boolean,
    onPicked: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val picked = task.status == "PICKED"
    // کم‌رنگ‌شدنِ قلمِ برداشته‌شده را نرم انیمیت می‌کنیم تا جابه‌جایی‌ها تند نشوند.
    val contentAlpha by animateFloatAsState(
        targetValue = if (picked) 0.45f else 1f,
        animationSpec = tween(durationMillis = 250),
        label = "pickRowAlpha",
    )

    Card(
        modifier = modifier
            .fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (picked) MaterialTheme.colorScheme.surface
            else MaterialTheme.colorScheme.surfaceContainer,
        ),
        onClick = { if (!picked && !busy) onPicked() },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Dimens.cardPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f).alpha(contentAlpha)) {
                // آدرس قفسه — مهم‌ترین چیز؛ کارگر باید سریع پیدایش کند، پس بزرگ و بالا.
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Filled.Place,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(Dimens.iconSmall),
                    )
                    Spacer(Modifier.width(Dimens.gapSmall))
                    Text(
                        text = task.location?.path?.takeIf { it.isNotBlank() }
                            ?: task.location?.name?.takeIf { it.isNotBlank() }
                            ?: task.location?.code
                            ?: "—",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        textDecoration = if (picked) TextDecoration.LineThrough else null,
                    )
                }
                Text(
                    text = task.product?.name ?: "—",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    textDecoration = if (picked) TextDecoration.LineThrough else null,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text(
                    text = "تعداد: ${faNum(task.quantity)} ${task.product?.unit ?: "عدد"}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
                if (!task.note.isNullOrBlank()) {
                    Text(
                        text = task.note,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                task.requestedBy?.fullName?.takeIf { it.isNotBlank() }?.let { who ->
                    Text(
                        text = "درخواست‌دهنده: $who",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }

            Box(
                modifier = Modifier.size(48.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (busy) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 3.dp)
                } else {
                    // تیک بزرگ — با دستکش هم قابل زدن. زدن = «آوردم».
                    Checkbox(
                        checked = picked,
                        onCheckedChange = { if (!picked) onPicked() },
                        enabled = !picked,
                    )
                }
            }
        }
    }
}

private const val FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
private fun faNum(n: Int): String =
    n.toString().map { if (it.isDigit()) FA_DIGITS[it - '0'] else it }.joinToString("")
