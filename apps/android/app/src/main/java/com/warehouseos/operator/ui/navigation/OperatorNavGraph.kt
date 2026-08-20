package com.warehouseos.operator.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.warehouseos.operator.data.repository.StartupDestination
import com.warehouseos.operator.ui.screens.catalog.CatalogSetupScreen
import com.warehouseos.operator.ui.screens.count.CountScreen
import com.warehouseos.operator.ui.screens.login.LoginScreen
import com.warehouseos.operator.ui.screens.locate.LocateScreen
import com.warehouseos.operator.ui.screens.newproduct.NewProductRequestScreen
import com.warehouseos.operator.ui.screens.mywork.MyWorkScreen
import com.warehouseos.operator.ui.screens.picktasks.PickTasksScreen
import com.warehouseos.operator.ui.screens.sales.SalesScreen
import com.warehouseos.operator.ui.screens.scan.ScanScreen
import com.warehouseos.operator.ui.screens.settings.SettingsScreen
import com.warehouseos.operator.ui.screens.shifthome.ShiftHomeScreen
import com.warehouseos.operator.ui.screens.worktasks.WorkTasksScreen
import com.warehouseos.operator.ui.screens.startup.StartupScreen
import com.warehouseos.operator.ui.screens.voice.VoiceEntryScreen
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
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
    /** Set by a pick-task notification tap; opens the pick list when true. */
    openPickTasks: StateFlow<Boolean> = MutableStateFlow(false),
    /** Reset callback after the open request has been consumed. */
    onPickTasksHandled: () -> Unit = {},
) {
    val shouldOpenPick by openPickTasks.collectAsState()
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route

    /*
     * Notification tap → open the queue.
     *
     * The route is part of the key on purpose. A cold start composes this while the
     * NavHost is still on STARTUP; consuming the request there (as this used to) both
     * failed to navigate and cleared the flag, so the tap did nothing and the worker
     * landed on the home screen. Now the request is held until the app reaches a
     * screen it can actually push onto, and this re-runs on every destination change.
     */
    LaunchedEffect(shouldOpenPick, currentRoute) {
        if (!shouldOpenPick) return@LaunchedEffect
        when (currentRoute) {
            null, Routes.STARTUP, Routes.LOGIN -> return@LaunchedEffect
            Routes.PICK_TASKS -> onPickTasksHandled()
            else -> {
                navController.navigate(Routes.PICK_TASKS)
                onPickTasksHandled()
            }
        }
    }

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
                    // A pending notification request is picked up by the effect above
                    // as soon as this lands on a real destination.
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
                // Through the catalog gate, never straight to the camera: without a
                // catalog on the phone, scanning a shelf leads nowhere useful.
                onStockIn = { navController.navigate(Routes.CATALOG_SETUP) },
                onCount = { navController.navigate(Routes.COUNT) },
                onLocate = { navController.navigate(Routes.LOCATE) },
                onMyWork = { navController.navigate(Routes.MY_WORK) },
                onPickTasks = { navController.navigate(Routes.PICK_TASKS) },
                onWorkTasks = { navController.navigate(Routes.WORK_TASKS) },
                onSettings = { navController.navigate(Routes.SETTINGS) },
                onLogout = {
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.WORK_TASKS) {
            WorkTasksScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.SALES) {
            SalesScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.LOCATE) {
            LocateScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.MY_WORK) {
            MyWorkScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.PICK_TASKS) {
            PickTasksScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.CATALOG_SETUP) {
            CatalogSetupScreen(
                // Replace itself in the back stack: pressing back from the camera
                // should return home, not bounce through the gate again.
                onReady = {
                    navController.navigate(Routes.SCAN) {
                        popUpTo(Routes.CATALOG_SETUP) { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.SCAN) {
            ScanScreen(
                onVoice = { barcode -> navController.navigate(Routes.voiceEntry(barcode)) },
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
                onRequestNewProduct = { p ->
                    navController.navigate(
                        Routes.newProduct(p.barcode, p.name, p.brand, p.vehicle, p.qty, p.unit, p.voice),
                    )
                },
            )
        }

        composable(
            route = Routes.NEW_PRODUCT_ROUTE,
            arguments = listOf(
                navArgument(Routes.ARG_BARCODE) { type = NavType.StringType; defaultValue = "" },
                navArgument(Routes.ARG_NAME) { type = NavType.StringType; defaultValue = "" },
                navArgument(Routes.ARG_BRAND) { type = NavType.StringType; defaultValue = "" },
                navArgument(Routes.ARG_VEHICLE) { type = NavType.StringType; defaultValue = "" },
                navArgument(Routes.ARG_QTY) { type = NavType.StringType; defaultValue = "1" },
                navArgument(Routes.ARG_UNIT) { type = NavType.StringType; defaultValue = "" },
                navArgument(Routes.ARG_VOICE) { type = NavType.StringType; defaultValue = "" },
            ),
        ) {
            NewProductRequestScreen(
                onBack = { navController.popBackStack() },
                onDone = {
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
