package com.warehouseos.operator.ui.theme

import androidx.compose.ui.graphics.Color

/*
 * Warehouse OS operator palette. Industrial orange (brand) + blue accent, tuned
 * for arm's-length reading on a warehouse floor. Full Material 3 roles are set so
 * surfaces, containers, and outlines are cohesive instead of falling back to M3
 * defaults. Green is mapped to `tertiary` so "success" states have a real role.
 */

// ---- Brand seeds ----
val BrandOrange = Color(0xFFF57C00)
val BrandOrangeDark = Color(0xFFE65100)
val BrandBlue = Color(0xFF1565C0)
val BrandBlueDark = Color(0xFF0D47A1)
val SuccessGreen = Color(0xFF2E7D32)
val ErrorRed = Color(0xFFC62828)

// Backwards-compatible surface seeds (kept: referenced elsewhere historically).
val SurfaceLight = Color(0xFFFAFAFA)
val SurfaceDark = Color(0xFF121212)

// ---- Light scheme ----
val LightPrimary = BrandOrange
val LightOnPrimary = Color(0xFFFFFFFF)
val LightPrimaryContainer = Color(0xFFFFDDB8)
val LightOnPrimaryContainer = Color(0xFF2B1700)
val LightSecondary = BrandBlue
val LightOnSecondary = Color(0xFFFFFFFF)
val LightSecondaryContainer = Color(0xFFD8E2FF)
val LightOnSecondaryContainer = Color(0xFF001A41)
val LightTertiary = SuccessGreen
val LightOnTertiary = Color(0xFFFFFFFF)
val LightTertiaryContainer = Color(0xFFB8F2B6)
val LightOnTertiaryContainer = Color(0xFF00210A)
val LightBackground = Color(0xFFF6F7F9)
val LightOnBackground = Color(0xFF1A1C1E)
val LightSurface = Color(0xFFFFFFFF)
val LightOnSurface = Color(0xFF1A1C1E)
val LightSurfaceVariant = Color(0xFFEBEEF2)
val LightOnSurfaceVariant = Color(0xFF44474E)
val LightSurfaceContainer = Color(0xFFF0F2F5)
val LightOutline = Color(0xFFC3C7CF)
val LightOutlineVariant = Color(0xFFDCE0E6)
val LightError = ErrorRed
val LightOnError = Color(0xFFFFFFFF)
val LightErrorContainer = Color(0xFFFFDAD6)
val LightOnErrorContainer = Color(0xFF410002)

// ---- Dark scheme ----
val DarkPrimary = Color(0xFFFFB86B)
val DarkOnPrimary = Color(0xFF462A00)
val DarkPrimaryContainer = Color(0xFF643E00)
val DarkOnPrimaryContainer = Color(0xFFFFDDB8)
val DarkSecondary = Color(0xFFACC7FF)
val DarkOnSecondary = Color(0xFF002E69)
val DarkSecondaryContainer = Color(0xFF16448D)
val DarkOnSecondaryContainer = Color(0xFFD8E2FF)
val DarkTertiary = Color(0xFF9DD59B)
val DarkOnTertiary = Color(0xFF003916)
val DarkTertiaryContainer = Color(0xFF135323)
val DarkOnTertiaryContainer = Color(0xFFB8F2B6)
val DarkBackground = Color(0xFF121316)
val DarkOnBackground = Color(0xFFE3E2E6)
val DarkSurface = Color(0xFF1A1C1E)
val DarkOnSurface = Color(0xFFE3E2E6)
val DarkSurfaceVariant = Color(0xFF303337)
val DarkOnSurfaceVariant = Color(0xFFC3C7CF)
val DarkSurfaceContainer = Color(0xFF212327)
val DarkOutline = Color(0xFF8D9199)
val DarkOutlineVariant = Color(0xFF43474E)
val DarkError = Color(0xFFFFB4AB)
val DarkOnError = Color(0xFF690005)
val DarkErrorContainer = Color(0xFF93000A)
val DarkOnErrorContainer = Color(0xFFFFDAD6)

// ---- Status accents (no native M3 role for "warning") ----
val WarningAmberContainerLight = Color(0xFFFFE9A8)
val WarningAmberOnContainerLight = Color(0xFF3B2E00)
val WarningAmberContainerDark = Color(0xFF5A4600)
val WarningAmberOnContainerDark = Color(0xFFFFE9A8)
