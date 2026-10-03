package com.warehouseos.operator.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.warehouseos.operator.R

/**
 * The Kardo mark, shared by the startup gate, login and the home header so the
 * app matches its own launcher icon and the web app.
 *
 * Drawn from the launcher foreground asset rather than a second copy, so there
 * is exactly one image to replace when the brand changes. It is an [Image], not
 * an [androidx.compose.material3.Icon]: the mark is multi-colour and tinting it
 * would flatten the gradient to a single colour.
 */
@Composable
fun BrandMark(
    modifier: Modifier = Modifier,
    size: Dp = 72.dp,
) {
    Image(
        painter = painterResource(R.mipmap.ic_launcher_foreground),
        contentDescription = null,
        modifier = modifier.size(size),
    )
}
