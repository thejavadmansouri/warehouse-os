package com.warehouseos.operator.ui.components

import androidx.compose.ui.unit.dp

/** Shared spacing/sizing — Apple HIG–inspired denser cards, soft continuous corners. */
object Dimens {
    val screenPadding = 20.dp
    val gapSmall = 8.dp
    val gap = 12.dp
    val gapLarge = 24.dp
    val cardPadding = 16.dp

    val fieldSpacing = 14.dp
    val buttonHeight = 52.dp
    val primaryActionHeight = 56.dp
    val hugeActionHeight = 72.dp

    /** نزدیک به cornerRadius پیوستهٔ UIKit (~16–22). */
    val corner = 16.dp
    val cornerSmall = 12.dp
    val cornerCapsule = 999.dp

    /** آیکن‌ها عمداً بزرگ‌اند — اپراتور از فاصله‌ی بازو نگاه می‌کند. */
    val iconSmall = 20.dp
    val icon = 26.dp
    val iconLarge = 32.dp
    val iconHuge = 44.dp
}
