package com.warehouseos.operator.ui.theme

import androidx.compose.ui.graphics.Color

/*
 * Warehouse OS operator palette — harmonized with the web redesign design system.
 * Blue-on-white: near-white surfaces, one brand blue (web `--primary`, OKLCH hue ~254),
 * neutral slate for secondary chrome, green success, amber warning, red error.
 * Full Material 3 roles are set so surfaces/containers/outlines stay cohesive.
 */

// ---- Brand seeds ----
val BrandBlue = Color(0xFF2563EB)
val BrandBlueDark = Color(0xFF6EA8FE)
val SuccessGreen = Color(0xFF1A9951)
val ErrorRed = Color(0xFFE30117)

// Backwards-compatible surface seeds (kept: referenced elsewhere historically).
val SurfaceLight = Color(0xFFF8FAFC)
val SurfaceDark = Color(0xFF0F1420)

// ---- Light scheme (blue on white) ----
val LightPrimary = BrandBlue
val LightOnPrimary = Color(0xFFFFFFFF)
val LightPrimaryContainer = Color(0xFFDCE8FF)
val LightOnPrimaryContainer = Color(0xFF10336F)
val LightSecondary = Color(0xFF475569)
val LightOnSecondary = Color(0xFFFFFFFF)
val LightSecondaryContainer = Color(0xFFE2E8F0)
val LightOnSecondaryContainer = Color(0xFF1E293B)
val LightTertiary = SuccessGreen
val LightOnTertiary = Color(0xFFFFFFFF)
val LightTertiaryContainer = Color(0xFFCBF4D5)
val LightOnTertiaryContainer = Color(0xFF1F4A2D)
val LightBackground = Color(0xFFF8FAFC)
val LightOnBackground = Color(0xFF0F172A)
val LightSurface = Color(0xFFFFFFFF)
val LightOnSurface = Color(0xFF0F172A)
val LightSurfaceVariant = Color(0xFFF1F5F9)
val LightOnSurfaceVariant = Color(0xFF64748B)
val LightSurfaceContainer = Color(0xFFF1F5F9)
val LightOutline = Color(0xFFE2E8F0)
val LightOutlineVariant = Color(0xFFEEF2F6)
val LightError = ErrorRed
val LightOnError = Color(0xFFFFFFFF)
val LightErrorContainer = Color(0xFFFFDBD4)
val LightOnErrorContainer = Color(0xFF7F211D)

// ---- Dark scheme (blue charcoal) ----
val DarkPrimary = BrandBlueDark
val DarkOnPrimary = Color(0xFF08203F)
val DarkPrimaryContainer = Color(0xFF1B2E4D)
val DarkOnPrimaryContainer = Color(0xFFD6E4FF)
val DarkSecondary = Color(0xFFA9B6C9)
val DarkOnSecondary = Color(0xFF17202E)
val DarkSecondaryContainer = Color(0xFF283244)
val DarkOnSecondaryContainer = Color(0xFFD6DFEC)
val DarkTertiary = Color(0xFF3BB974)
val DarkOnTertiary = Color(0xFF031108)
val DarkTertiaryContainer = Color(0xFF173523)
val DarkOnTertiaryContainer = Color(0xFF8AE5AB)
val DarkBackground = Color(0xFF0F1420)
val DarkOnBackground = Color(0xFFEDF1F7)
val DarkSurface = Color(0xFF151B2A)
val DarkOnSurface = Color(0xFFEDF1F7)
val DarkSurfaceVariant = Color(0xFF1E2537)
val DarkOnSurfaceVariant = Color(0xFF9AA5B8)
val DarkSurfaceContainer = Color(0xFF202839)
val DarkOutline = Color(0x26FFFFFF)
val DarkOutlineVariant = Color(0x17FFFFFF)
val DarkError = Color(0xFFF4514F)
val DarkOnError = Color(0xFF3A0A0A)
val DarkErrorContainer = Color(0xFF5C1717)
val DarkOnErrorContainer = Color(0xFFFFC6C0)

// ---- Status accents (no native M3 role for "warning") ----
val WarningAmberContainerLight = Color(0xFFFFDFB1)
val WarningAmberOnContainerLight = Color(0xFF3E290F)
val WarningAmberContainerDark = Color(0xFF4C3202)
val WarningAmberOnContainerDark = Color(0xFFF2B54A)
