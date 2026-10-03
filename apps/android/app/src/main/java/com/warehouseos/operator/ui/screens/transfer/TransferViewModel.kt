package com.warehouseos.operator.ui.screens.transfer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.warehouseos.operator.data.remote.ApiResult
import com.warehouseos.operator.data.repository.TransferRepository
import com.warehouseos.operator.ui.components.faNum
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * «انتقال بین قفسه» — جابه‌جایی موجودی از یک قفسه به قفسه‌ی دیگر.
 *
 * ماشین حالت: SOURCE → PRODUCT → QUANTITY → DESTINATION → REVIEW → (ثبت) → SOURCE.
 * مبدأ با یک تماس موجودیِ قفسه (بارکد → کالاها) resolve می‌شود؛ مقصد فقط id
 * می‌گیرد؛ و خودِ انتقال همان POST /inventory-transfer است که وب ادمین استفاده
 * می‌کند — هیچ سطح API جدیدی برای این جریان ساخته نشده.
 */
@HiltViewModel
class TransferViewModel @Inject constructor(
    private val repo: TransferRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TransferUiState())
    val uiState: StateFlow<TransferUiState> = _uiState.asStateFlow()

    private val _toast = MutableStateFlow<String?>(null)
    val toast: StateFlow<String?> = _toast.asStateFlow()

    private var sourceLocationId: String? = null
    private var destinationLocationId: String? = null

    /** برای دکمه‌ی «تلاش دوباره» — آخرین بارکدی که resolve نشد. */
    private var lastFailedBarcode: String? = null
    private var lastFailedStep: TransferStep? = null

    fun clearToast() {
        _toast.value = null
    }

    // ---------- مبدأ ----------
    fun onSourceBarcode(barcode: String) {
        val code = barcode.trim()
        if (code.isBlank() || _uiState.value.loading) return
        lastFailedBarcode = code
        lastFailedStep = TransferStep.SOURCE
        _uiState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.shelfStock(code)) {
                is ApiResult.Success -> {
                    sourceLocationId = r.data.location.id
                    destinationLocationId = null
                    _uiState.update {
                        it.copy(
                            loading = false,
                            step = TransferStep.PRODUCT,
                            sourceShelf = r.data.location.name,
                            productsOnShelf = r.data.items.map { item ->
                                TransferProduct(
                                    id = item.productId,
                                    name = item.name,
                                    sku = item.sku,
                                    availableQty = item.availableQty,
                                )
                            },
                            selectedProduct = null,
                            quantity = 1,
                            destinationShelf = null,
                        )
                    }
                }
                is ApiResult.Unauthorized -> fail("نشست شما منقضی شده. دوباره وارد شوید")
                is ApiResult.NetworkError -> fail("اتصال به سرور برقرار نشد")
                is ApiResult.ServerError -> fail(r.message)
            }
        }
    }

    // ---------- انتخاب کالا و تعداد ----------
    fun onPickProduct(product: TransferProduct) {
        _uiState.update {
            it.copy(
                selectedProduct = product,
                quantity = 1,
                step = TransferStep.QUANTITY,
                error = null,
            )
        }
    }

    /** کلَپ بین ۱ و موجودی — خود UI هم دکمه را در مرزها غیرفعال می‌کند. */
    fun onQuantityChange(quantity: Int) {
        val max = _uiState.value.selectedProduct?.availableQty?.coerceAtLeast(1) ?: 1
        _uiState.update { it.copy(quantity = quantity.coerceIn(1, max)) }
    }

    fun onConfirmQuantity() {
        val product = _uiState.value.selectedProduct ?: return
        if (_uiState.value.quantity !in 1..product.availableQty) return
        _uiState.update { it.copy(step = TransferStep.DESTINATION, error = null) }
    }

    // ---------- مقصد ----------
    fun onDestinationBarcode(barcode: String) {
        val code = barcode.trim()
        if (code.isBlank() || _uiState.value.loading) return
        lastFailedBarcode = code
        lastFailedStep = TransferStep.DESTINATION
        _uiState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.resolveLocation(code)) {
                is ApiResult.Success -> {
                    destinationLocationId = r.data.id
                    _uiState.update {
                        it.copy(loading = false, destinationShelf = r.data.name, step = TransferStep.REVIEW)
                    }
                }
                is ApiResult.Unauthorized -> fail("نشست شما منقضی شده. دوباره وارد شوید")
                is ApiResult.NetworkError -> fail("اتصال به سرور برقرار نشد")
                is ApiResult.ServerError -> fail(r.message)
            }
        }
    }

    // ---------- ثبت ----------
    fun onSubmit() {
        val from = sourceLocationId ?: return
        val to = destinationLocationId ?: return
        val product = _uiState.value.selectedProduct ?: return
        val qty = _uiState.value.quantity
        if (qty < 1) return
        _uiState.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.transfer(product.id, from, to, qty)) {
                is ApiResult.Success -> {
                    _toast.value = "انتقال انجام شد: ${faNum(qty)} عدد «${product.name}»"
                    reset()
                }
                is ApiResult.Unauthorized -> fail("نشست شما منقضی شده. دوباره وارد شوید")
                is ApiResult.NetworkError -> fail("اتصال به سرور برقرار نشد")
                is ApiResult.ServerError -> fail(r.message)
            }
        }
    }

    // ---------- ناوبری بین مراحل ----------
    fun onBackStep() {
        val next = when (_uiState.value.step) {
            TransferStep.PRODUCT -> TransferStep.SOURCE
            TransferStep.QUANTITY -> TransferStep.PRODUCT
            TransferStep.DESTINATION -> TransferStep.QUANTITY
            TransferStep.REVIEW -> TransferStep.DESTINATION
            TransferStep.SOURCE -> TransferStep.SOURCE // دکمه‌ای ندارد
        }
        _uiState.update { it.copy(step = next, error = null) }
    }

    fun onRetry() {
        val step = lastFailedStep ?: return
        val barcode = lastFailedBarcode ?: return
        when (step) {
            TransferStep.SOURCE -> onSourceBarcode(barcode)
            TransferStep.DESTINATION -> onDestinationBarcode(barcode)
            else -> _uiState.update { it.copy(error = null) }
        }
    }

    private fun fail(message: String) {
        _uiState.update { it.copy(loading = false, error = message) }
    }

    private fun reset() {
        sourceLocationId = null
        destinationLocationId = null
        lastFailedBarcode = null
        lastFailedStep = null
        _uiState.value = TransferUiState()
    }
}