package com.warehouseos.operator.data.settings

import android.content.Context
import androidx.core.content.edit
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persists the active shift's session id across process restarts.
 *
 * The worker's day is fully offline: if the OS kills the app at 2pm (battery
 * optimization, crash, update) the shift must survive, otherwise the worker is
 * blocked by a server round-trip they can't make until the evening. The session
 * id is a plain UUID for voice ops — not sensitive — so SharedPreferences is fine.
 */
@Singleton
class SessionStore @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs = context.getSharedPreferences("operator_session", Context.MODE_PRIVATE)

    fun sessionId(): String? =
        prefs.getString(KEY_SESSION_ID, null)?.takeIf { it.isNotBlank() }

    fun save(sessionId: String) {
        prefs.edit { putString(KEY_SESSION_ID, sessionId) }
    }

    fun clear() {
        prefs.edit { remove(KEY_SESSION_ID) }
    }

    private companion object {
        const val KEY_SESSION_ID = "session_id"
    }
}
