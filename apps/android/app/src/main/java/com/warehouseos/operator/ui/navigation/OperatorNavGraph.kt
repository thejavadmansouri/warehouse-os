package com.warehouseos.operator.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.warehouseos.operator.data.repository.StartupDestination
import com.warehouseos.operator.ui.screens.count.CountScreen
import com.warehouseos.operator.ui.screens.login.LoginScreen
import com.warehouseos.operator.ui.screens.scan.ScanScreen
import com.warehouseos.operator.ui.screens.settings.SettingsScreen
import com.warehouseos.operator.ui.screens.shifthome.ShiftHomeScreen
import com.warehouseos.operator.ui.screens.startup.StartupScreen
import com.warehouseos.operator.ui.screens.voice.VoiceEntryScreen

/**
 * App navigation.
 *
 * Start destination is [Routes.STARTUP], which validates any cached session and
 * routes to Login or ShiftHome (Epic 2, task 13). Login/ShiftHome are real; the
 * scan/voice/count screens remain placeholders until their epics.
 */
@Composable
fun OperatorNavGraph(
    navController: NavHostController = rememberNavController(),
) {
    NavHost(
        navController = navController,
        startDestination = Routes.STARTUP,
    ) {
        composable(Routes.STARTUP) {
            StartupScreen(
                onResolved = { destination ->
                    val target = when (destination) {
                        StartupDestination.LOGIN -> Routes.LOGIN
                        StartupDestination.SHIFT_HOME -> Routes.SHIFT_HOME
                    }
                    navController.navigate(target) {
                        popUpTo(Routes.STARTUP) { inclusive = true }
                    }
                },
            )
        }

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
                onScanned = { barcode -> navController.navigate(Routes.voiceEntry(barcode)) },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.VOICE_ENTRY_ROUTE,
            arguments = listOf(navArgument(Routes.ARG_BARCODE) { type = NavType.StringType }),
        ) {
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
