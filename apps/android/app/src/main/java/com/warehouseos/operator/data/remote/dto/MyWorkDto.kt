package com.warehouseos.operator.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /mobile/my-work — کارهایی که همین کارگر ثبت کرده، همراه تصمیم مدیر.
 *
 * کارگر باید ببیند چه ثبت کرده، چند تا تأیید شده، و کدام رد شده و چرا.
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
)

@Serializable
data class MyWorkItem(
    val id: String,
    /** PENDING | APPROVED | REJECTED */
    val status: String = "PENDING",
    val productName: String? = null,
    val voiceText: String? = null,
    val quantity: Int = 1,
    /** دلیل رد شدن، اگر مدیر رد کرده باشد. */
    val reviewNote: String? = null,
    val reviewedByName: String? = null,
    val createdAt: String? = null,
    val reviewedAt: String? = null,
)
