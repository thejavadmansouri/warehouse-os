package com.warehouseos.operator.data.speech

/** Shared user-facing Persian text for an STT failure — every voice UI maps through this. */
fun SttError.toUserMessage(): String = when (this) {
    SttError.NO_PERMISSION -> "دسترسی به میکروفون داده نشده است"
    SttError.NO_NETWORK -> "برای تشخیص گفتار به اینترنت نیاز است. متن را دستی وارد کنید"
    SttError.NO_SPEECH -> "صدایی شنیده نشد. دوباره تلاش کنید"
    SttError.UNAVAILABLE -> "تشخیص گفتار روی این دستگاه در دسترس نیست"
    SttError.ENGINE_FAILURE -> "خطا در تشخیص گفتار. دوباره تلاش کنید"
}
