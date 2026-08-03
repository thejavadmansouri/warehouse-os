package com.warehouseos.operator.ui.screens.sales

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.remote.dto.PriceRef
import com.warehouseos.operator.data.remote.dto.ProductDto
import com.warehouseos.operator.data.remote.dto.StockLocationDto
import com.warehouseos.operator.data.repository.SalesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class SalesPhase { SEARCH, ENTRY, SUBMITTING, SUCCESS }

data class SalesUiState(
    val phase: SalesPhase = SalesPhase.SEARCH,
    val query: String = "",
    val isSearching: Boolean = false,
    val results: List<ProductDto> = emptyList(),
    val product: ProductDto? = null,
    val loadingStock: Boolean = false,
    val stock: List<StockLocationDto> = emptyList(),
    val selectedLocationId: String? = null,
    val quantity: Int = 1,
    val unitPrice: Int? = null,
    val successText: String? = null,
    val error: String? = null,
) {
    val selectedLocation: StockLocationDto?
        get() = stock.firstOrNull { it.locationId == selectedLocationId }
    val maxQuantity: Int get() = selectedLocation?.quantity ?: 1
    val total: Long get() = (unitPrice?.toLong() ?: 0L) * quantity
    val canSubmit: Boolean
        get() = product != null && selectedLocationId != null && quantity in 1..maxQuantity
}

@HiltViewModel
class SalesViewModel @Inject constructor(
    private val repo: SalesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SalesUiState())
    val uiState: StateFlow<SalesUiState> = _uiState.asStateFlow()

    fun onQueryChange(q: String) = _uiState.update { it.copy(query = q, error = null) }

    fun runSearch() {
        val q = _uiState.value.query.trim()
        if (q.isBlank()) return
        _uiState.update { it.copy(isSearching = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.search(q)) {
                is ApiResult.Success ->
                    _uiState.update { it.copy(isSearching = false, results = r.data) }
                else ->
                    _uiState.update { it.copy(isSearching = false, error = errorText(r)) }
            }
        }
    }

    // اسکن بارکد → کالا + موجودی در یک درخواست → مستقیم به مرحله‌ی تعداد/قیمت
    fun resolveBarcode(barcode: String) {
        val code = barcode.trim()
        if (code.isBlank()) return
        _uiState.update { it.copy(loadingStock = true, phase = SalesPhase.ENTRY, error = null) }
        viewModelScope.launch {
            when (val r = repo.resolveBarcode(code)) {
                is ApiResult.Success -> {
                    val d = r.data
                    _uiState.update {
                        it.copy(
                            loadingStock = false,
                            product = ProductDto(
                                id = d.product.id,
                                name = d.product.name,
                                sku = d.product.sku,
                                unit = d.product.unit,
                                prices = d.product.salePrice?.let { sp -> listOf(PriceRef(salePrice = sp)) },
                            ),
                            unitPrice = d.product.salePrice,
                            quantity = 1,
                            stock = d.stock,
                            selectedLocationId = d.stock.firstOrNull()?.locationId,
                        )
                    }
                }
                is ApiResult.ServerError ->
                    _uiState.update {
                        it.copy(
                            loadingStock = false,
                            phase = SalesPhase.SEARCH,
                            error = if (r.code == 404) "کالایی با این بارکد پیدا نشد" else errorText(r),
                        )
                    }
                else ->
                    _uiState.update {
                        it.copy(loadingStock = false, phase = SalesPhase.SEARCH, error = errorText(r))
                    }
            }
        }
    }

    fun selectProduct(p: ProductDto) {
        val defaultPrice = p.prices?.firstOrNull()?.salePrice
        _uiState.update {
            it.copy(
                product = p,
                loadingStock = true,
                phase = SalesPhase.ENTRY,
                unitPrice = defaultPrice,
                quantity = 1,
                stock = emptyList(),
                selectedLocationId = null,
                error = null,
            )
        }
        viewModelScope.launch {
            when (val r = repo.stock(p.id)) {
                is ApiResult.Success ->
                    _uiState.update {
                        it.copy(
                            loadingStock = false,
                            stock = r.data,
                            // اگر فقط یک مکان دارد، خودکار انتخاب شود
                            selectedLocationId = r.data.firstOrNull()?.locationId,
                        )
                    }
                else ->
                    _uiState.update { it.copy(loadingStock = false, error = errorText(r)) }
            }
        }
    }

    fun selectLocation(id: String) =
        _uiState.update { it.copy(selectedLocationId = id, quantity = 1) }

    fun incQuantity() = _uiState.update {
        it.copy(quantity = (it.quantity + 1).coerceAtMost(it.maxQuantity))
    }

    fun decQuantity() = _uiState.update {
        it.copy(quantity = (it.quantity - 1).coerceAtLeast(1))
    }

    fun onPriceChange(v: String) = _uiState.update {
        it.copy(unitPrice = v.filter { c -> c.isDigit() }.toIntOrNull())
    }

    fun confirmSell() {
        val s = _uiState.value
        if (!s.canSubmit || s.product == null || s.selectedLocationId == null) return
        _uiState.update { it.copy(phase = SalesPhase.SUBMITTING, error = null) }
        viewModelScope.launch {
            when (val r = repo.sell(s.product.id, s.selectedLocationId, s.quantity, s.unitPrice)) {
                is ApiResult.Success ->
                    _uiState.update {
                        it.copy(
                            phase = SalesPhase.SUCCESS,
                            successText = "${s.quantity} ${s.product.unit ?: "عدد"} «${s.product.name}» فروخته شد" +
                                (s.unitPrice?.let { p -> " — مبلغ کل ${formatMoney(p.toLong() * s.quantity)} ریال" } ?: ""),
                        )
                    }
                else ->
                    _uiState.update { it.copy(phase = SalesPhase.ENTRY, error = errorText(r)) }
            }
        }
    }

    fun newSale() = _uiState.value.let {
        _uiState.value = SalesUiState()
    }

    fun backToSearch() = _uiState.update {
        it.copy(phase = SalesPhase.SEARCH, product = null, error = null)
    }

    private fun errorText(r: ApiResult<*>): String = when (r) {
        is ApiResult.ServerError ->
            if (r.code == 400) "موجودی کافی نیست یا اطلاعات نادرست است"
            else if (r.code == 403) "دسترسی فروش فقط برای مدیر است"
            else "خطای سرور (${r.code})"
        is ApiResult.Unauthorized -> "نشست منقضی شده — دوباره وارد شوید"
        is ApiResult.NetworkError -> "اتصال به سرور برقرار نشد"
        else -> "خطای نامشخص"
    }
}

fun formatMoney(v: Long): String =
    v.toString().reversed().chunked(3).joinToString(",").reversed()
