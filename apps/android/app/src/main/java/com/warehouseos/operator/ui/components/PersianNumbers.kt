package com.warehouseos.operator.ui.components

private val FA_DIGITS = charArrayOf('۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹')

/**
 * Latin digits → Persian digits, for anything an operator reads on screen.
 *
 * Shared because several screens had grown their own private copy of exactly
 * this function; new code should use this one.
 */
fun faNum(n: Int): String =
    n.toString().map { if (it.isDigit()) FA_DIGITS[it - '0'] else it }.joinToString("")

/** Same conversion for text that already contains digits (codes, quantities). */
fun faNum(s: String): String =
    s.map { if (it.isDigit()) FA_DIGITS[it - '0'] else it }.joinToString("")
