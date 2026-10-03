package com.warehouseos.operator.data.session

import com.warehouseos.operator.data.FakeSharedPreferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The session store is the only thing standing between "phone handover" and a
 * leaked JWT, so its contract is pinned here: what gets written, what a restart
 * reads back, and what `clear()` really removes.
 */
class SecureTokenStoreTest {

    private lateinit var prefs: FakeSharedPreferences
    private lateinit var store: SecureTokenStore

    private val staff = AuthUser(
        id = "u1",
        username = "ali",
        fullName = "علی رضایی",
        role = "STAFF",
    )

    @Before
    fun setUp() {
        prefs = FakeSharedPreferences()
        store = SecureTokenStore(prefs)
    }

    @Test
    fun `no session means no token and no user`() {
        assertNull(store.currentToken())
        assertNull(store.cachedUser())
    }

    @Test
    fun `saveSession persists token and identity into encrypted prefs`() {
        store.saveSession("tok-1", staff)

        assertEquals("tok-1", store.currentToken())
        assertEquals(staff, store.cachedUser())
        // Token + identity really landed in the encrypted prefs, not just in the
        // volatile mirror — otherwise a process restart would log the worker out.
        assertTrue(prefs.raw.containsKey("jwt"))
        assertEquals("STAFF", prefs.raw["role"])
    }

    @Test
    fun `a new store over the same prefs resumes the session like a process restart`() {
        store.saveSession("tok-1", staff)

        val restarted = SecureTokenStore(prefs)

        assertEquals("tok-1", restarted.currentToken())
        assertEquals("ali", restarted.cachedUser()?.username)
        assertEquals("علی رضایی", restarted.cachedUser()?.fullName)
    }

    @Test
    fun `updateToken rotates the JWT without touching the identity`() {
        store.saveSession("tok-old", staff)

        store.updateToken("tok-new")

        assertEquals("tok-new", store.currentToken())
        // Sliding-session refresh must not be mistaken for a different user.
        assertEquals(staff, store.cachedUser())
    }

    @Test
    fun `updateToken ignores blank or unchanged tokens`() {
        store.saveSession("tok-1", staff)

        store.updateToken("")
        assertEquals("tok-1", store.currentToken())

        store.updateToken("tok-1")
        assertEquals("tok-1", store.currentToken())
    }

    @Test
    fun `clear wipes token and identity from disk`() {
        store.saveSession("tok-1", staff)

        store.clear()

        assertNull(store.currentToken())
        assertNull(store.cachedUser())
        assertTrue(prefs.raw.isEmpty())
    }

    @Test
    fun `role gate allows the operator roles and blocks the rest`() {
        assertTrue(staff.isAllowedOperator)
        assertTrue(AuthUser("u", "m", "", "MANAGER").isAllowedOperator)
        assertTrue(AuthUser("u", "a", "", "ADMIN").isAllowedOperator)
        assertFalse(AuthUser("u", "acc", "", "ACCOUNTANT").isAllowedOperator)
        assertFalse(AuthUser("u", "x", "", "").isAllowedOperator)
    }
}
