package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /mobile/my-work — ثبت‌های امروز + وضعیت تأیید، چاپ لیبل و عکس.
 *
 * فیلدهای اضافه‌ی سرور با defaultها تحمل می‌شوند (خواندن مقاوم).
 */
@Serializable
data class MyWorkResponse(
    val summary: MyWorkSummary = MyWorkSummary(),
    val items: List<MyWorkItem> = emptyList(),
)

@Serializable
data class MyWorkSummary(
    val total: Int = 0,
    val pending: Int = 0,
    val approved: Int = 0,
    val rejected: Int = 0,
    val printQueued: Int = 0,
    val printDone: Int = 0,
    val withPhoto: Int = 0,
)

@Serializable
data class MyWorkItem(
    val id: String,
    /** IN | COUNT */
    val type: String = "IN",
    /** PENDING | APPROVED | REJECTED */
    val status: String = "PENDING",
    val productName: String? = null,
    val productSku: String? = null,
    val voiceText: String? = null,
    val quantity: Int = 1,
    val unit: String? = null,
    val locationCode: String? = null,
    val locationPath: String? = null,
    /** نام کارگر ثبت‌کننده — برای مدیر وقتی کار دیگران را بررسی کرده. */
    val workerName: String? = null,
    /** true اگر خود کاربر ثبت کرده باشد. */
    val mine: Boolean = true,
    /** دلیل رد شدن، اگر مدیر رد کرده باشد. */
    val reviewNote: String? = null,
    val reviewedByName: String? = null,
    val createdAt: String? = null,
    val reviewedAt: String? = null,
    val photoCount: Int = 0,
    val photoIds: List<String> = emptyList(),
    /**
     * NONE | QUEUED | PRINTING | PRINTED | FAILED | CANCELLED
     */
    val printStatus: String = "NONE",
    val printCopies: Int? = null,
)
