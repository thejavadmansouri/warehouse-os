package com.warehouseos.operator.ui.screens.startup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warehouse
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.warehouseos.operator.data.repository.StartupDestination
import com.warehouseos.operator.ui.components.Dimens

/**
 * Startup gate (Epic 2, task 13). Brief brand splash while the cached session is
 * validated, then reports the resolved destination exactly once.
 */
@Composable
fun StartupScreen(
    onResolved: (StartupDestination) -> Unit,
    viewModel: StartupViewModel = hiltViewModel(),
) {
    val destination by viewModel.destination.collectAsState()

    LaunchedEffect(destination) {
        destination?.let(onResolved)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(Dimens.screenPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.Filled.Warehouse,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(72.dp),
        )
        Text(
            text = "انبار هوشمند",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(top = Dimens.gap),
        )
        Text(
            text = "اپراتور انبار",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = Dimens.gapSmall),
        )
        CircularProgressIndicator(
            modifier = Modifier.padding(top = Dimens.gapLarge * 2),
        )
    }
}
