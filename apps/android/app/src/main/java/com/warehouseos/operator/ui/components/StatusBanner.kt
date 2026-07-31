package com.warehouseos.operator.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.warehouseos.operator.ui.theme.LocalIsDarkTheme
import com.warehouseos.operator.ui.theme.WarningAmberContainerDark
import com.warehouseos.operator.ui.theme.WarningAmberContainerLight
import com.warehouseos.operator.ui.theme.WarningAmberOnContainerDark
import com.warehouseos.operator.ui.theme.WarningAmberOnContainerLight

enum class BannerType { Info, Success, Warning, Error }

/**
 * A compact, color-coded status strip — used for pending-sync notices, inline
 * errors, and success confirmations so feedback looks the same everywhere.
 */
@Composable
fun StatusBanner(
    text: String,
    type: BannerType,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    onClick: (() -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    val dark = LocalIsDarkTheme.current
    val container: Color
    val content: Color
    when (type) {
        BannerType.Info -> {
            container = scheme.secondaryContainer
            content = scheme.onSecondaryContainer
        }
        BannerType.Success -> {
            container = scheme.tertiaryContainer
            content = scheme.onTertiaryContainer
        }
        BannerType.Warning -> {
            container = if (dark) WarningAmberContainerDark else WarningAmberContainerLight
            content = if (dark) WarningAmberOnContainerDark else WarningAmberOnContainerLight
        }
        BannerType.Error -> {
            container = scheme.errorContainer
            content = scheme.onErrorContainer
        }
    }

    Surface(
        color = container,
        contentColor = content,
        shape = RoundedCornerShape(Dimens.cornerSmall),
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            if (icon != null) {
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier
                        .size(22.dp)
                        .padding(end = 0.dp),
                )
                androidx.compose.foundation.layout.Spacer(Modifier.size(10.dp))
            }
            Text(text = text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
