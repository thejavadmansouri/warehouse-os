package com.warehouseos.operator.data

import com.warehouseos.operator.data.local.CatalogDao
import com.warehouseos.operator.data.local.CatalogProductEntity
import com.warehouseos.operator.data.local.OutboxDao
import com.warehouseos.operator.data.local.OutboxEntity
import com.warehouseos.operator.data.local.OutboxStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/**
 * In-memory [OutboxDao] for repository tests — same semantics as the Room DAO
 * (FIFO drain, status updates, flows), no Android required.
 */
class FakeOutboxDao : OutboxDao {

    private val rows = LinkedHashMap<String, OutboxEntity>()
    private val _unsynced = MutableStateFlow(0)
    private val _failed = MutableStateFlow<List<OutboxEntity>>(emptyList())

    override suspend fun insert(op: OutboxEntity) {
        rows.putIfAbsent(op.clientRequestId, op)
        recompute()
    }

    override suspend fun getSyncable(): List<OutboxEntity> =
        rows.values.filter { it.status == OutboxStatus.PENDING }.sortedBy { it.createdAt }

    override suspend fun updateStatus(id: String, status: String, attempts: Int, error: String?) {
        val cur = rows[id] ?: return
        rows[id] = cur.copy(status = status, attemptCount = attempts, lastError = error)
        recompute()
    }

    override suspend fun retry(id: String) {
        val cur = rows[id] ?: return
        rows[id] = cur.copy(status = OutboxStatus.PENDING, attemptCount = 0, lastError = null)
        recompute()
    }

    override fun unsyncedCount(): Flow<Int> = _unsynced

    override fun failed(): Flow<List<OutboxEntity>> = _failed

    /**
     * ردیف‌های یک نوع، زنده — صفحه‌ی برگه‌ی سفید با این می‌بیند چه چیزی هنوز
     * نرفته. با `revision` واقعاً به تغییرات واکنش می‌دهد (نسخه‌ی اول این بدل
     * فقط لحظه‌ی صدا زدن را می‌دید و بعد از حذف/سینک کهنه می‌ماند).
     */
    override fun unsyncedOfType(type: String): Flow<List<OutboxEntity>> =
        revision.map {
            rows.values
                .filter { it.type == type && it.status != OutboxStatus.SYNCED }
                .sortedBy { it.createdAt }
        }

    private val revision = MutableStateFlow(0)

    override suspend fun delete(id: String): Int {
        val removed = rows.remove(id) != null
        recompute()
        return if (removed) 1 else 0
    }


    override suspend fun clearSynced() {
        rows.entries.removeIf { it.value.status == OutboxStatus.SYNCED }
        recompute()
    }

    fun all(): List<OutboxEntity> = rows.values.toList()

    private fun recompute() {
        revision.value++
        _unsynced.value = rows.values.count {
            it.status == OutboxStatus.PENDING || it.status == OutboxStatus.FAILED
        }
        _failed.value = rows.values
            .filter { it.status == OutboxStatus.FAILED }
            .sortedByDescending { it.createdAt }
    }
}

/**
 * In-memory [CatalogDao] for repository tests — mirrors the Room DAO's
 * replace-upsert, delete, count and maxUpdatedAt semantics.
 */
class FakeCatalogDao : CatalogDao {

    private val rows = LinkedHashMap<String, CatalogProductEntity>()
    private val _count = MutableStateFlow(0)

    override suspend fun upsertAll(products: List<CatalogProductEntity>) {
        products.forEach { rows[it.id] = it }
        _count.value = rows.size
    }

    override suspend fun deleteByIds(ids: List<String>) {
        ids.forEach(rows::remove)
        _count.value = rows.size
    }

    override suspend fun count(): Int = rows.size

    override fun countFlow(): Flow<Int> = _count

    override suspend fun maxUpdatedAt(): Long? = rows.values.maxOfOrNull { it.updatedAt }

    override suspend fun getAll(): List<CatalogProductEntity> = rows.values.toList()

    override suspend fun byId(id: String): CatalogProductEntity? = rows[id]

    override suspend fun bySku(sku: String): CatalogProductEntity? =
        rows.values.firstOrNull { it.sku == sku }

    fun all(): List<CatalogProductEntity> = rows.values.toList()
}

/** بدلِ صفِ عکس — هر سه قلابی که outbox صدا می‌زند ثبت می‌شوند تا تست ببیندشان. */
class FakePhotoQueue : com.warehouseos.operator.data.repository.PhotoQueue {
    val discarded = mutableListOf<String>()
    val failed = mutableListOf<String>()
    val requeued = mutableListOf<String>()

    override suspend fun discardFor(clientRequestId: String) {
        discarded += clientRequestId
    }

    override suspend fun failFor(clientRequestId: String, reason: String) {
        failed += clientRequestId
    }

    override suspend fun requeueFor(clientRequestId: String) {
        requeued += clientRequestId
    }
}

/** In-memory catalog-ready flag. */
class FakeCatalogReadyFlag : com.warehouseos.operator.data.settings.CatalogReadyFlag {
    private var ready = false
    override fun isCatalogReady(): Boolean = ready
    override fun setCatalogReady(ready: Boolean) {
        this.ready = ready
    }
}

/**
 * In-memory [android.content.SharedPreferences] so the encrypted session store
 * can be exercised on the JVM. Same semantics the store relies on: values
 * survive reads, `clear()` empties everything, `edit {}` applies immediately.
 */
class FakeSharedPreferences : android.content.SharedPreferences {

    private val values = mutableMapOf<String, Any?>()

    /** Raw view for assertions (e.g. "did anything get written at all?"). */
    val raw: Map<String, Any?> get() = values.toMap()

    override fun getAll(): MutableMap<String, *> = values.toMutableMap()

    override fun getString(key: String?, defValue: String?): String? =
        values[key] as? String ?: defValue

    override fun getStringSet(key: String?, defValues: MutableSet<String>?): MutableSet<String>? =
        @Suppress("UNCHECKED_CAST")
        (values[key] as? MutableSet<String>) ?: defValues

    override fun getInt(key: String?, defValue: Int): Int = values[key] as? Int ?: defValue

    override fun getLong(key: String?, defValue: Long): Long = values[key] as? Long ?: defValue

    override fun getFloat(key: String?, defValue: Float): Float = values[key] as? Float ?: defValue

    override fun getBoolean(key: String?, defValue: Boolean): Boolean =
        values[key] as? Boolean ?: defValue

    override fun contains(key: String?): Boolean = values.containsKey(key)

    override fun edit(): android.content.SharedPreferences.Editor = Editor()

    override fun registerOnSharedPreferenceChangeListener(
        listener: android.content.SharedPreferences.OnSharedPreferenceChangeListener?,
    ) = Unit

    override fun unregisterOnSharedPreferenceChangeListener(
        listener: android.content.SharedPreferences.OnSharedPreferenceChangeListener?,
    ) = Unit

    private inner class Editor : android.content.SharedPreferences.Editor {
        private val staged = mutableMapOf<String, Any?>()
        private var clear = false

        override fun putString(key: String?, value: String?) = apply(key, value)

        override fun putStringSet(key: String?, values: MutableSet<String>?) = apply(key, values)

        override fun putInt(key: String?, value: Int) = apply(key, value)

        override fun putLong(key: String?, value: Long) = apply(key, value)

        override fun putFloat(key: String?, value: Float) = apply(key, value)

        override fun putBoolean(key: String?, value: Boolean) = apply(key, value)

        override fun remove(key: String?) = apply(key, REMOVED)

        override fun clear(): android.content.SharedPreferences.Editor = also { clear = true }

        override fun commit(): Boolean {
            flush()
            return true
        }

        override fun apply() = flush()

        private fun apply(key: String?, value: Any?): android.content.SharedPreferences.Editor {
            if (key != null) staged[key] = value
            return this
        }

        private fun flush() {
            if (clear) values.clear()
            staged.forEach { (k, v) -> if (v === REMOVED) values.remove(k) else values[k] = v }
        }
    }

    private companion object {
        val REMOVED = Any()
    }
}

/**
 * Records watcher start/stop instead of touching a real foreground service.
 * The login flow's whole point is "sign in ⇒ start ringing for pick tasks",
 * so this is the observable under test there.
 */
class FakeWorkTaskWatcher : com.warehouseos.operator.data.notifications.WorkTaskWatcher {
    var startCount = 0
        private set
    var stopCount = 0
        private set

    val running: Boolean get() = startCount > stopCount

    override fun start() {
        startCount++
    }

    override fun stop() {
        stopCount++
    }
}

/** In-memory settings, so login tests never need a real Android Context. */
class FakeAppSettings(
    private var url: String = "http://10.0.0.9:3000",
) : com.warehouseos.operator.data.settings.AppSettings {
    override fun baseUrl(): String = url

    override fun setBaseUrl(url: String) {
        this.url = url.trim()
    }
}
