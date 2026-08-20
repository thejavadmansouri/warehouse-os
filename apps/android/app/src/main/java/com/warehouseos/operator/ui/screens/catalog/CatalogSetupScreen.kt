package com.warehouseos.operator.ui.screens.catalog

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.LoadingState
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.StatusBanner

/**
 * Catalog gate for stock-in. Forwards straight to [onReady] when the catalog is
 * already on the phone; otherwise downloads it first. The worker is never asked
 * to choose — the app decides.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogSetupScreen(
    onReady: () -> Unit,
    onBack: () -> Unit,
    viewModel: CatalogSetupViewModel = hiltViewModel(),
) {
    val ready by viewModel.ready.collectAsState()
    val count by viewModel.count.collectAsState()
    val state by viewModel.uiState.collectAsState()

    // Ready (already, or just now) → straight on to scanning.
    LaunchedEffect(ready) {
        if (ready) onReady()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("آماده‌سازی کاتالوگ") },
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
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Ready is about to redirect — don't paint a second screen behind it.
            if (ready) return@Column

            Icon(
                imageVector = Icons.Filled.CloudDownload,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .padding(top = Dimens.gapLarge)
                    .size(96.dp),
            )

            Text(
                text = "برای ثبت کالا، کاتالوگ محصولات باید روی گوشی باشد",
                style = MaterialTheme.typography.titleLarge,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Dimens.gapLarge),
            )
            Text(
                text = "یک‌بار روی وای‌فای مغازه دانلود می‌شود؛ بعد از آن در انبار " +
                    "بدون وای‌فای هم کار می‌کند.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Dimens.gapSmall),
            )

            if (state.downloading) {
                LoadingState(
                    label = if (count > 0) "در حال دریافت… ($count محصول)" else "در حال دریافت کاتالوگ…",
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Dimens.gapLarge),
                )
            } else {
                state.message?.let { message ->
                    StatusBanner(
                        text = message,
                        type = if (state.failed) BannerType.Error else BannerType.Success,
                        modifier = Modifier.padding(top = Dimens.gapLarge),
                    )
                }
                PrimaryButton(
                    text = "تلاش دوباره",
                    onClick = viewModel::download,
                    icon = Icons.Filled.Refresh,
                    modifier = Modifier.padding(top = Dimens.gapLarge),
                )
            }
        }
    }
}
