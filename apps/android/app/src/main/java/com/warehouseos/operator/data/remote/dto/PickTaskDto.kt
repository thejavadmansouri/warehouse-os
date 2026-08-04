package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /pick-tasks/mine — صف کارِ برداشتِ همین کارگر.
 *
 * فروشنده/مدیر روی ویندوز لوکیشن کالا را برای کارگر می‌فرستد؛ کارگر اینجا
 * آدرس دقیق قفسه + نام کالا + تعداد را می‌بیند و بعد از برداشتن «آوردم» می‌زند.
 *
 * موجودی اینجا تغییر نمی‌کند — «آوردم» فقط یک ادعای اتمیک است تا دو کارگر
 * همزمان دنبال یک جنس نروند. کسر واقعی هنگام ثبت فاکتور روی ویندوز انجام می‌شود.
 *
 * فیلدهای اضافه‌ی سرور با defaultها تحمل می‌شوند (خواندن مقاوم).
 */
@Serializable
data class PickTaskDto(
    val id: String,
    /** PENDING | PICKED | CANCELLED */
    val status: String = "PENDING",
    val quantity: Int = 1,
    val note: String? = null,
    val product: PickTaskProduct? = null,
    val location: PickTaskLocation? = null,
    val requestedBy: PickTaskPerson? = null,
    val pickedBy: PickTaskPerson? = null,
    val createdAt: String? = null,
    val pickedAt: String? = null,
)

@Serializable
data class PickTaskProduct(
    val id: String,
    val name: String = "",
    val sku: String? = null,
    val unit: String? = null,
    val internalBarcode: String? = null,
)

@Serializable
data class PickTaskLocation(
    val id: String,
    val name: String = "",
    val code: String = "",
    val barcode: String? = null,
    /** آدرسِ خواندنیِ قفسه، مثل «راهرو A ‹ قفسه ۱ ‹ باکس ۳» — کارگر باید همین را ببیند. */
    val path: String? = null,
)

@Serializable
data class PickTaskPerson(
    val id: String,
    val fullName: String? = null,
)
