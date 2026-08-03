package com.warehouseos.operator.ui.screens.locate

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.data.remote.dto.LocateResultDto
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.StatusBanner

/**
 * «یافتن کالا» — برای همه‌ی نقش‌ها. اسمِ کالا را سرچ کن؛ اگر موجودی داشته باشد،
 * آدرسِ دقیقِ هر قفسه + تعداد و مجموعِ کل را نشان می‌دهد. فقط خواندنی (فروش/تغییر ندارد).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocateScreen(
    onBack: () -> Unit,
    viewModel: LocateViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("یافتن کالا") },
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
            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                label = { Text("نام کالا") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { viewModel.search() }),
                modifier = Modifier.fillMaxWidth(),
            )
            PrimaryButton(
                text = "جستجو",
                onClick = viewModel::search,
                enabled = state.query.isNotBlank(),
                loading = state.loading,
                icon = Icons.Filled.Search,
                modifier = Modifier.padding(top = Dimens.gap),
            )

            if (state.error != null) {
                StatusBanner(
                    text = state.error!!,
                    type = BannerType.Error,
                    modifier = Modifier.padding(top = Dimens.gap),
                )
            }

            if (state.searched && state.results.isEmpty() && !state.loading) {
                Text(
                    text = "کالایی پیدا نشد",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = Dimens.gapLarge),
                )
            }

            LazyColumn(
                modifier = Modifier.padding(top = Dimens.gap),
            ) {
                items(state.results, key = { it.id }) { item ->
                    LocateCard(item)
                }
            }
        }
    }
}

@Composable
private fun LocateCard(item: LocateResultDto) {
    val inStock = item.totalStock > 0
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = Dimens.gapSmall),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
        ),
    ) {
        Column(Modifier.padding(Dimens.cardPadding)) {
            Text(item.name, style = MaterialTheme.typography.titleMedium)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 2.dp),
            ) {
                if (!item.sku.isNullOrBlank()) {
                    Text(
                        "کد: ${item.sku}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = if (inStock) "  •  مجموع: ${item.totalStock} ${item.unit ?: "عدد"}" else "",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            if (!inStock) {
                StatusBanner(
                    text = "موجودی ثبت‌شده‌ای ندارد — هنوز در انبار ثبت نشده",
                    type = BannerType.Warning,
                    modifier = Modifier.padding(top = Dimens.gapSmall),
                )
            } else {
                Column(Modifier.padding(top = Dimens.gapSmall)) {
                    item.locations.forEach { loc ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(vertical = 3.dp),
                        ) {
                            Icon(
                                Icons.Filled.LocationOn,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.tertiary,
                                modifier = Modifier.size(Dimens.iconSmall),
                            )
                            Column(Modifier.padding(start = 6.dp).weight(1f)) {
                                Text(
                                    text = loc.path.ifBlank { loc.name.ifBlank { loc.code } },
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                if (loc.code.isNotBlank()) {
                                    Text(
                                        loc.code,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            Text(
                                text = "${loc.quantity}",
                                style = MaterialTheme.typography.displaySmall,
                            )
                        }
                    }
                }
            }
        }
    }
}
