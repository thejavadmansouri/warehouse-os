# پرامپت آماده برای GLM / OX-Alpha — صفحه‌ی «انتقال بین قفسه»

کپی کن و عیناً بده. این تکه عمداً **خودبسنده و فقط ظاهری** است: هیچ شبکه/ViewModel/DI ندارد، پس می‌تواند مستقل ساخته شود. من (Claude) سیم‌کشی ViewModel + Repository + API را جدا می‌زنم.

---

You are writing ONE Kotlin file for an existing Android app. Output ONLY the file content, no explanation.

**File:** `app/src/main/java/com/warehouseos/operator/ui/screens/transfer/TransferContent.kt`
**Package:** `com.warehouseos.operator.ui.screens.transfer`

## Context
Jetpack Compose + Material 3 app for warehouse floor workers in Iran. UI is **Persian (Farsi), RTL**. Users wear gloves and look at the phone from arm's length, so touch targets and text must be LARGE. Dark and light themes both must work — use `MaterialTheme.colorScheme` only, never hardcoded colors.

## Hard requirements
- The file must contain **only stateless composables**. No ViewModel, no Hilt, no networking, no `remember` of business state, no navigation. Everything comes in via parameters; every user action goes out via a callback.
- Do not invent new design tokens or new components. Use ONLY what is listed below.
- Write all user-visible strings in Persian, inline in the code (no string resources).
- Persian digits everywhere for numbers: call `faNum(n)`.

## Available API you MUST use (already exists — just import it)
```kotlin
import com.warehouseos.operator.ui.components.Dimens          // screenPadding, gapSmall, gap, gapLarge, cardPadding, fieldSpacing, buttonHeight, primaryActionHeight, hugeActionHeight, corner, cornerSmall, iconSmall, icon, iconLarge, iconHuge
import com.warehouseos.operator.ui.components.PrimaryButton   // (text, onClick, modifier, enabled=true, loading=false, icon: ImageVector? = null)
import com.warehouseos.operator.ui.components.SecondaryButton // (text, onClick, modifier, enabled=true, icon: ImageVector? = null)
import com.warehouseos.operator.ui.components.StatusBanner    // (text, type: BannerType, modifier, icon: ImageVector? = null, onClick: (() -> Unit)? = null)
import com.warehouseos.operator.ui.components.BannerType      // Info, Success, Warning, Error
import com.warehouseos.operator.ui.components.faNum           // faNum(Int): String and faNum(String): String
```

## Exact types to declare in this file
```kotlin
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
```

## The composable to write
```kotlin
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
)
```

## Behaviour per step
- `SOURCE` — heading «قفسه‌ی مبدأ را اسکن کنید», then render `scannerSlot()`.
- `PRODUCT` — show the source shelf code at top («مبدأ: …»), then a scrollable list of `productsOnShelf`. Each row: product name (bold, may wrap to 2 lines max with ellipsis), sku below it in a muted style, and the available quantity on the trailing side as `faNum(availableQty)`. Whole row is tappable → `onPickProduct(it)`. If the list is empty show a friendly Persian empty message.
- `QUANTITY` — show the selected product name, then a big stepper: a large «−» button, the current quantity in a very large font (`faNum`), a large «+» button. Clamp between 1 and `selectedProduct.availableQty` — the caller does the clamping, but you must DISABLE «−» at 1 and «+» at the max. Below it a `PrimaryButton` «تأیید تعداد» → `onConfirmQuantity()`.
- `DESTINATION` — heading «قفسه‌ی مقصد را اسکن کنید», show source + product + qty as a compact summary, then `scannerSlot()`.
- `REVIEW` — a summary card: از «`sourceShelf`» → به «`destinationShelf`», product name, quantity. Then a `PrimaryButton` «انجام انتقال» → `onSubmit()`, with `loading = state.loading`.

## Cross-cutting
- If `state.error != null`, render a `StatusBanner(type = BannerType.Error)` with the message and an `onClick` wired to `onRetry`.
- Except on `SOURCE`, show a `SecondaryButton` «مرحله‌ی قبل» → `onBackStep()`.
- Wrap the whole thing in a `Column` with `Modifier.padding(Dimens.screenPadding)` and make it vertically scrollable where content can overflow.
- Add a `@Preview` for at least the `PRODUCT` and `REVIEW` steps with fake data.

Output the complete file, ready to compile.
