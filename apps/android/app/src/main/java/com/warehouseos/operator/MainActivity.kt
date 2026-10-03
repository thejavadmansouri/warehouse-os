package com.warehouseos.operator

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.warehouseos.operator.ui.navigation.OperatorNavGraph
import com.warehouseos.operator.ui.theme.WarehouseOperatorTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Single-activity host. All screens are Compose destinations under [OperatorNavGraph].
 *
 * Also owns two cross-cutting pieces of the pick-task alert flow:
 *  - requests POST_NOTIFICATIONS on Android 13+ so new-task alerts can ring
 *  - forwards notification taps that ask to open the pick-task list
 *    (see [EXTRA_OPEN_PICK_TASKS]) into the nav graph
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    /** Set by a notification tap; consumed by [OperatorNavGraph] to open PickTasks. */
    private val openPickTasks = MutableStateFlow(false)

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            // Denied is fine — alerts degrade silently; everything else still works.
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        setContent {
            WarehouseOperatorTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    OperatorNavGraph(
                        openPickTasks = openPickTasks,
                        onPickTasksHandled = { openPickTasks.value = false },
                    )
                }
                // Heads-up pick alerts need the notification permission on 13+.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    val launcher = remember { notificationPermissionLauncher }
                    LaunchedEffect(Unit) {
                        launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.getBooleanExtra(EXTRA_OPEN_PICK_TASKS, false) == true) {
            openPickTasks.value = true
        }
    }

    companion object {
        const val EXTRA_OPEN_PICK_TASKS = "extra_open_pick_tasks"
    }
}
