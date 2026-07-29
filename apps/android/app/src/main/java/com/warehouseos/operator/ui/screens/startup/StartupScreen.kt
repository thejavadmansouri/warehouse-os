package com.warehouseos.operator.ui.screens.startup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
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

/**
 * Startup gate (Epic 2, task 13). Shows a brief loading state while the session
 * is validated, then reports the resolved destination exactly once.
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
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Text(
            text = "در حال بارگذاری…",
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(top = 16.dp),
        )
    }
}
