package com.warehouseos.operator.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = BrandOrange,
    onPrimary = Color.White,
    secondary = BrandBlue,
    onSecondary = Color.White,
    background = SurfaceLight,
    error = ErrorRed,
)

private val DarkColors = darkColorScheme(
    primary = BrandOrange,
    onPrimary = Color.Black,
    secondary = BrandBlue,
    onSecondary = Color.White,
    background = SurfaceDark,
    error = ErrorRed,
)

@Composable
fun WarehouseOperatorTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
