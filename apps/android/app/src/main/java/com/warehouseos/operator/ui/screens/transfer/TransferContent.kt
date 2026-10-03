package com.warehouseos.operator.ui.screens.transfer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import com.warehouseos.operator.ui.components.BannerType
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.PrimaryButton
import com.warehouseos.operator.ui.components.SecondaryButton
import com.warehouseos.operator.ui.components.StatusBanner
import com.warehouseos.operator.ui.components.faNum
import com.warehouseos.operator.ui.theme.WarehouseOperatorTheme

enum class TransferStep { SOURCE, PRODUCT, QUANTITY, DESTINATION, REVIEW }

data class TransferProduct(
    val id: String,
    val name: String,
    val sku: String?,
    val availableQty: Int,
)

data class TransferUiState(
    val step: TransferStep = TransferStep.SOURCE,
    val sourceShelf: String? = null,
    val destinationShelf: String? = null,
    val productsOnShelf: List<TransferProduct> = emptyList(),
    val selectedProduct: TransferProduct? = null,
    val quantity: Int = 1,
    val loading: Boolean = false,
    val error: String? = null,
)

/**
 * «انتقال بین قفسه» — جابه‌جایی موجودی از یک قفسه به قفسه‌ی دیگر.
 *
 * عمداً فقط ظاهری و stateless است: هیچ ViewModel/شبکه/DI ندارد. همه‌چیز از
 * پارامتر می‌آید و هر اقدام کاربر از طریق callback بیرون می‌رود؛ سیم‌کشی
 * ViewModel + Repository + API جداگانه انجام می‌شود.
 */
@Composable
fun TransferContent(
    state: TransferUiState,
    onPickProduct: (TransferProduct) -> Unit,
    onQuantityChange: (Int) -> Unit,
    onConfirmQuantity: () -> Unit,
    onSubmit: () -> Unit,
    onBackStep: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    /** Camera scanner slot — the caller supplies the real scanner composable. */
    scannerSlot: @Composable () -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Dimens.screenPadding)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(Dimens.gap),
    ) {
        if (state.error != null) {
            StatusBanner(
                text = state.error,
                type = BannerType.Error,
                onClick = onRetry,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        if (state.step != TransferStep.SOURCE) {
            SecondaryButton(
                text = "مرحله‌ی قبل",
                onClick = onBackStep,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        when (state.step) {
            TransferStep.SOURCE -> SourceStep(scannerSlot = scannerSlot)

            TransferStep.PRODUCT -> ProductStep(
                sourceShelf = state.sourceShelf,
                products = state.productsOnShelf,
                onPickProduct = onPickProduct,
            )

            TransferStep.QUANTITY -> QuantityStep(
                product = state.selectedProduct,
                quantity = state.quantity,
                onQuantityChange = onQuantityChange,
                onConfirmQuantity = onConfirmQuantity,
            )

            TransferStep.DESTINATION -> DestinationStep(
                sourceShelf = state.sourceShelf,
                product = state.selectedProduct,
                quantity = state.quantity,
                scannerSlot = scannerSlot,
            )

            TransferStep.REVIEW -> ReviewStep(
                state = state,
                onSubmit = onSubmit,
            )
        }
    }
}

@Composable
private fun StepHeading(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun SourceStep(scannerSlot: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
        StepHeading(text = "قفسه‌ی مبدأ را اسکن کنید")
        scannerSlot()
    }
}

@Composable
private fun ProductStep(
    sourceShelf: String?,
    products: List<TransferProduct>,
    onPickProduct: (TransferProduct) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
        if (sourceShelf != null) {
            Text(
                text = "مبدأ: ${faNum(sourceShelf)}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }

        if (products.isEmpty()) {
            Text(
                text = "محصولی در این قفسه یافت نشد",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = Dimens.gapLarge),
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(Dimens.gapSmall)) {
                products.forEach { product ->
                    ProductRow(
                        product = product,
                        onClick = { onPickProduct(product) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ProductRow(
    product: TransferProduct,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
        ),
    ) {
        Row(
            modifier = Modifier.padding(Dimens.cardPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = product.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (product.sku != null) {
                    Text(
                        text = product.sku,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Text(
                text = faNum(product.availableQty),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = Dimens.gapSmall),
            )
        }
    }
}

@Composable
private fun QuantityStep(
    product: TransferProduct?,
    quantity: Int,
    onQuantityChange: (Int) -> Unit,
    onConfirmQuantity: () -> Unit,
) {
    val maxQty = product?.availableQty ?: 0

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Dimens.gapLarge),
    ) {
        Text(
            text = product?.name ?: "محصولی انتخاب نشده است",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Dimens.gap),
        ) {
            IconButton(
                onClick = { onQuantityChange(quantity - 1) },
                enabled = quantity > 1,
                modifier = Modifier.size(Dimens.hugeActionHeight),
            ) {
                Text(
                    text = "−",
                    style = MaterialTheme.typography.headlineLarge,
                )
            }

            Text(
                text = faNum(quantity),
                style = MaterialTheme.typography.displayMedium,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.width(Dimens.hugeActionHeight * 2),
            )

            IconButton(
                onClick = { onQuantityChange(quantity + 1) },
                enabled = product != null && quantity < maxQty,
                modifier = Modifier.size(Dimens.hugeActionHeight),
            ) {
                Text(
                    text = "+",
                    style = MaterialTheme.typography.headlineLarge,
                )
            }
        }

        Text(
            text = "موجودی: ${faNum(maxQty)}",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        PrimaryButton(
            text = "تأیید تعداد",
            onClick = onConfirmQuantity,
            enabled = product != null && quantity in 1..maxQty,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun DestinationStep(
    sourceShelf: String?,
    product: TransferProduct?,
    quantity: Int,
    scannerSlot: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
        StepHeading(text = "قفسه‌ی مقصد را اسکن کنید")
        TransferSummaryCard(
            sourceShelf = sourceShelf,
            destinationShelf = null,
            product = product,
            quantity = quantity,
        )
        scannerSlot()
    }
}

@Composable
private fun TransferSummaryCard(
    sourceShelf: String?,
    destinationShelf: String?,
    product: TransferProduct?,
    quantity: Int,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(Dimens.cardPadding),
            verticalArrangement = Arrangement.spacedBy(Dimens.gapSmall),
        ) {
            if (sourceShelf != null) {
                val route = if (destinationShelf != null) {
                    "از «${faNum(sourceShelf)}» به «${faNum(destinationShelf)}»"
                } else {
                    "مبدأ: ${faNum(sourceShelf)}"
                }
                Text(
                    text = route,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            if (product != null) {
                Text(
                    text = product.name,
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
            Text(
                text = "تعداد: ${faNum(quantity)}",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ReviewStep(
    state: TransferUiState,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(Dimens.gapLarge)) {
        TransferSummaryCard(
            sourceShelf = state.sourceShelf,
            destinationShelf = state.destinationShelf,
            product = state.selectedProduct,
            quantity = state.quantity,
        )
        PrimaryButton(
            text = "انجام انتقال",
            onClick = onSubmit,
            loading = state.loading,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Preview(showBackground = true, locale = "fa")
@Composable
private fun TransferProductPreview() {
    WarehouseOperatorTheme {
        TransferContent(
            state = TransferUiState(
                step = TransferStep.PRODUCT,
                sourceShelf = "A-12",
                productsOnShelf = listOf(
                    TransferProduct(id = "1", name = "فیلتر روغن خودرو", sku = "OF-101", availableQty = 24),
                    TransferProduct(id = "2", name = "لنت ترمز جلو", sku = "BR-220", availableQty = 5),
                    TransferProduct(id = "3", name = "شمع خودرو", sku = null, availableQty = 0),
                ),
            ),
            onPickProduct = {},
            onQuantityChange = {},
            onConfirmQuantity = {},
            onSubmit = {},
            onBackStep = {},
            onRetry = {},
            scannerSlot = {},
        )
    }
}

@Preview(showBackground = true, locale = "fa")
@Composable
private fun TransferQuantityPreview() {
    WarehouseOperatorTheme {
        TransferContent(
            state = TransferUiState(
                step = TransferStep.QUANTITY,
                sourceShelf = "A-12",
                selectedProduct = TransferProduct(
                    id = "1",
                    name = "فیلتر روغن خودرو",
                    sku = "OF-101",
                    availableQty = 24,
                ),
                quantity = 3,
            ),
            onPickProduct = {},
            onQuantityChange = {},
            onConfirmQuantity = {},
            onSubmit = {},
            onBackStep = {},
            onRetry = {},
            scannerSlot = {},
        )
    }
}

@Preview(showBackground = true, locale = "fa")
@Composable
private fun TransferReviewPreview() {
    WarehouseOperatorTheme {
        TransferContent(
            state = TransferUiState(
                step = TransferStep.REVIEW,
                sourceShelf = "A-12",
                destinationShelf = "B-07",
                selectedProduct = TransferProduct(
                    id = "1",
                    name = "فیلتر روغن خودرو",
                    sku = "OF-101",
                    availableQty = 24,
                ),
                quantity = 3,
            ),
            onPickProduct = {},
            onQuantityChange = {},
            onConfirmQuantity = {},
            onSubmit = {},
            onBackStep = {},
            onRetry = {},
            scannerSlot = {},
        )
    }
}