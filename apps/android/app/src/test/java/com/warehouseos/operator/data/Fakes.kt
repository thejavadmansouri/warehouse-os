package com.warehouseos.operator.data

import com.warehouseos.operator.data.local.CatalogDao
import com.warehouseos.operator.data.local.CatalogProductEntity
import com.warehouseos.operator.data.local.OutboxDao
import com.warehouseos.operator.data.local.OutboxEntity
import com.warehouseos.operator.data.local.OutboxStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

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

/** No-op photo queue — the outbox only needs the discard hook. */
class FakePhotoQueue : com.warehouseos.operator.data.repository.PhotoQueue {
    val discarded = mutableListOf<String>()
    override suspend fun discardFor(clientRequestId: String) {
        discarded += clientRequestId
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
