package com.warehouseos.operator.ui.screens.linkbarcode

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.local.CatalogProductEntity
import com.warehouseos.operator.data.repository.CatalogRepository
import com.warehouseos.operator.data.repository.OutboxRepository
import com.warehouseos.operator.data.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * چسباندنِ بارکدِ روی جعبه به یک کالای کاتالوگ.
 *
 * چرا روی گوشی: کارگر همان کسی است که جعبه دستش است. تا امروز این کار فقط در
 * پنل وب ممکن بود، یعنی کسی باید بارکد را یادداشت می‌کرد و پشت میز وارد می‌کرد.
 *
 * تمامش آفلاین کار می‌کند: هم تشخیصِ «این بارکد قبلاً گرفته شده» و هم انتخابِ
 * کالا از کاتالوگِ روی گوشی. خودِ اتصال در outbox می‌نشیند.
 */
data class LinkBarcodeUiState(
    /** بارکدی که اسکن شده و منتظرِ انتخابِ کالاست. */
    val barcode: String = "",
    /** اگر این بارکد از قبل به کالایی وصل باشد. */
    val alreadyLinkedTo: CatalogProductEntity? = null,
    val query: String = "",
    val results: List<CatalogProductEntity> = emptyList(),
    val searching: Boolean = false,
    val toast: String? = null,
)

@HiltViewModel
class LinkBarcodeViewModel @Inject constructor(
    private val catalog: CatalogRepository,
    private val outbox: OutboxRepository,
    private val syncScheduler: SyncScheduler,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LinkBarcodeUiState())
    val uiState: StateFlow<LinkBarcodeUiState> = _uiState.asStateFlow()

    /** بارکدِ تازه اسکن‌شده. اول بررسی می‌شود که آزاد است یا نه. */
    fun onBarcode(raw: String) {
        val code = raw.trim()
        if (code.isEmpty()) return

        viewModelScope.launch {
            val owner = catalog.findByBarcode(code)
            _uiState.update {
                it.copy(
                    barcode = code,
                    alreadyLinkedTo = owner,
                    query = "",
                    results = emptyList(),
                )
            }
        }
    }

    fun onQueryChange(q: String) {
        _uiState.update { it.copy(query = q, searching = q.trim().length >= 2) }
        viewModelScope.launch {
            val found = catalog.search(q)
            // نتیجه‌ی جستجوی قدیمی نباید روی تایپِ تازه بنشیند.
            if (_uiState.value.query == q) {
                _uiState.update { it.copy(results = found, searching = false) }
            }
        }
    }

    fun link(product: CatalogProductEntity) {
        val code = _uiState.value.barcode
        if (code.isEmpty()) return

        viewModelScope.launch {
            outbox.enqueueBarcodeLink(productId = product.id, barcode = code)
            // تا سرور تأیید کند، همین گوشی هم باید بارکد را بشناسد — جعبه‌ی بعدی
            // که اسکن می‌شود معمولاً همین است.
            catalog.addBarcodeLocally(productId = product.id, barcode = code)
            syncScheduler.requestSync()
            _uiState.update {
                LinkBarcodeUiState(toast = "«${product.name}» با این بارکد ثبت شد")
            }
        }
    }

    /** بارکد را رها کن و آماده‌ی اسکنِ جعبه‌ی بعدی شو. */
    fun reset() = _uiState.update { LinkBarcodeUiState() }

    fun clearToast() = _uiState.update { it.copy(toast = null) }
}
