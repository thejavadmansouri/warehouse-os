package com.warehouseos.operator.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.warehouseos.operator.ui.screens.count.CountScreen
import com.warehouseos.operator.ui.screens.login.LoginScreen
import com.warehouseos.operator.ui.screens.scan.ScanScreen
import com.warehouseos.operator.ui.screens.settings.SettingsScreen
import com.warehouseos.operator.ui.screens.shifthome.ShiftHomeScreen
import com.warehouseos.operator.ui.screens.voice.VoiceEntryScreen

/**
 * App navigation skeleton (Epic 0).
 *
 * Start destination is [Routes.LOGIN]; the app-start routing that decides
 * Login vs ShiftHome based on a cached token lands in Epic 2 (task 13).
 * Screen bodies are placeholders wired only for navigation for now.
 */
@Composable
fun OperatorNavGraph(
    navController: NavHostController = rememberNavController(),
) {
    NavHost(
        navController = navController,
        startDestination = Routes.LOGIN,
    ) {
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(Routes.SHIFT_HOME) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.SHIFT_HOME) {
            ShiftHomeScreen(
                onStockIn = { navController.navigate(Routes.SCAN) },
                onCount = { navController.navigate(Routes.COUNT) },
                onSettings = { navController.navigate(Routes.SETTINGS) },
                onLogout = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.SCAN) {
            ScanScreen(
                onProceedToVoice = { navController.navigate(Routes.VOICE_ENTRY) },
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.VOICE_ENTRY) {
            VoiceEntryScreen(
                onBack = { navController.popBackStack() },
                onScanNext = {
                    navController.navigate(Routes.SCAN) {
                        popUpTo(Routes.SHIFT_HOME)
                    }
                },
            )
        }

        composable(Routes.COUNT) {
            CountScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
            )
        }
    }
}
