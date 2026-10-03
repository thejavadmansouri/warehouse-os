package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * یک قلمِ برگه‌ی سفید: متنِ آزاد + تعداد، و قیمتِ پیشنهادیِ اختیاری.
 *
 * `text` عمداً آزاد است — معنای «سفید» همین است که کارگر می‌تواند چیزی را بگوید
 * که هنوز در سیستم نیست و منتظر ثبت کالا نماند. قیمتِ نهایی را مدیر می‌گذارد،
 * پس `suggestedPrice` فقط یک راهنماست.
 */
@Serializable
data class BlankQuotationLineRequest(
    val text: String,
    val quantity: Int,
    val suggestedPrice: Int? = null,
)

/**
 * POST mobile/blank-quotations body.
 *
 * `clientRequestId` کلید یکتای سمت سرور است: برگه آفلاین ساخته می‌شود و اگر
 * ارسال دوباره شود، سرور باید همان برگه را برگرداند نه یک برگه‌ی تازه.
 * `warehouseId` عمداً اینجا نیست — سرور خودش انبار را انتخاب می‌کند.
 */
@Serializable
data class CreateBlankQuotationRequest(
    val clientRequestId: String,
    val customerName: String? = null,
    val note: String? = null,
    val lines: List<BlankQuotationLineRequest>,
)

/** پاسخ ساخت — فقط آنچه گوشی لازم دارد. */
@Serializable
data class BlankQuotationCreated(
    val id: String,
    val number: Int,
    val status: String? = null,
)

/** یک برگه‌ی سفیدِ همین کاربر، برای نمایش وضعیتِ آنچه فرستاده است. */
@Serializable
data class MyBlankQuotation(
    val id: String,
    val number: Int,
    val status: String,
    val unpricedCount: Int = 0,
    val customerName: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class MyBlankQuotationsResponse(
    val data: List<MyBlankQuotation> = emptyList(),
)
