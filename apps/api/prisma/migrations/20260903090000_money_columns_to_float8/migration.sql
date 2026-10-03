-- بردِ ستون‌های پول از INT4 به float8 (double precision)
--
-- چرا: سقفِ INT4 (۲٬۱۴۷٬۴۸۳٬۶۴۷ ریال ≈ ۲۱۴ میلیون تومان) برای سندِ
-- حسابداریِ واقعی کم است — مثلاً فاکتورِ ۱۰ میلیارد تومانی (= ۱۰۰ میلیارد ریال)
-- از همین سقف رد می‌شود.
--
-- چرا float8 و نه bigint: هر دو تا ۹ کواذریلیون می‌روند، ولی float8 در
-- TypeScript همان `number` می‌ماند — هیچ کدی در TS/Prisma تغییر نوع نمی‌دهد.
-- دقتِ float8 برای عددهای صحیح تا ۲⁵³ ≈ ۹×۱۰¹⁵ تضمین‌شده است؛ سقفِ عملیِ
-- هر سند در کد (money.ts: 1e12 ریال) هزاران بار پایین‌تر است.
--
-- تبدیل از INT4 به float8 بی‌ضرر و برگشت‌پذیر است؛ هیچ مقدارِ موجودی از دست
-- نمی‌رود (هر INT4 دقیقاً در float8 جا می‌شود).
--
-- Additive-only است: هیچ جدولی حذف یا ساخته نمی‌شود، فقط نوعِ ستون‌ها عوض می‌شود.

-- ─── ProductPrice ───
ALTER TABLE "ProductPrice" ALTER COLUMN "purchasePrice" TYPE DOUBLE PRECISION;
ALTER TABLE "ProductPrice" ALTER COLUMN "salePrice" TYPE DOUBLE PRECISION;
ALTER TABLE "ProductPrice" ALTER COLUMN "wholesalePrice" TYPE DOUBLE PRECISION;
ALTER TABLE "ProductPrice" ALTER COLUMN "managerPrice" TYPE DOUBLE PRECISION;
ALTER TABLE "ProductPrice" ALTER COLUMN "compareAtPrice" TYPE DOUBLE PRECISION;

-- ─── PurchaseInvoice ───
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "subtotal" TYPE DOUBLE PRECISION;
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "discount" TYPE DOUBLE PRECISION;
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "total" TYPE DOUBLE PRECISION;

-- ─── InventoryLog ───
ALTER TABLE "InventoryLog" ALTER COLUMN "unitPrice" TYPE DOUBLE PRECISION;
ALTER TABLE "InventoryLog" ALTER COLUMN "lineDiscount" TYPE DOUBLE PRECISION;

-- ─── Customer ───
ALTER TABLE "Customer" ALTER COLUMN "creditLimit" TYPE DOUBLE PRECISION;

-- ─── SaleInvoice ───
ALTER TABLE "SaleInvoice" ALTER COLUMN "subtotal" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleInvoice" ALTER COLUMN "discount" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleInvoice" ALTER COLUMN "financeCharge" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleInvoice" ALTER COLUMN "total" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleInvoice" ALTER COLUMN "paidAmount" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleInvoice" ALTER COLUMN "dueAmount" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleInvoice" ALTER COLUMN "profit" TYPE DOUBLE PRECISION;

-- ─── Payment / Receipt / ReceiptPayment ───
ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE DOUBLE PRECISION;
ALTER TABLE "Receipt" ALTER COLUMN "amount" TYPE DOUBLE PRECISION;
ALTER TABLE "ReceiptPayment" ALTER COLUMN "amount" TYPE DOUBLE PRECISION;

-- ─── Cheque ───
ALTER TABLE "Cheque" ALTER COLUMN "charge" TYPE DOUBLE PRECISION;

-- ─── CustomerLedger ───
ALTER TABLE "CustomerLedger" ALTER COLUMN "amount" TYPE DOUBLE PRECISION;

-- ─── PaymentReversal ───
ALTER TABLE "PaymentReversal" ALTER COLUMN "amount" TYPE DOUBLE PRECISION;

-- ─── CustomerPayout ───
ALTER TABLE "CustomerPayout" ALTER COLUMN "amount" TYPE DOUBLE PRECISION;

-- ─── SaleReturn / SaleReturnLine ───
ALTER TABLE "SaleReturn" ALTER COLUMN "refundAmount" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleReturnLine" ALTER COLUMN "unitRefund" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleReturnLine" ALTER COLUMN "lineRefund" TYPE DOUBLE PRECISION;

-- ─── SaleCorrection / SaleCorrectionLine ───
ALTER TABLE "SaleCorrection" ALTER COLUMN "amountAdjust" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleCorrectionLine" ALTER COLUMN "oldUnitPrice" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleCorrectionLine" ALTER COLUMN "newUnitPrice" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleCorrectionLine" ALTER COLUMN "lineAdjust" TYPE DOUBLE PRECISION;

-- ─── Quotation / QuotationLine ───
ALTER TABLE "Quotation" ALTER COLUMN "subtotal" TYPE DOUBLE PRECISION;
ALTER TABLE "Quotation" ALTER COLUMN "discount" TYPE DOUBLE PRECISION;
ALTER TABLE "Quotation" ALTER COLUMN "total" TYPE DOUBLE PRECISION;
ALTER TABLE "QuotationLine" ALTER COLUMN "unitPrice" TYPE DOUBLE PRECISION;
ALTER TABLE "QuotationLine" ALTER COLUMN "discount" TYPE DOUBLE PRECISION;

-- ─── ShopSettings ───
ALTER TABLE "ShopSettings" ALTER COLUMN "shippingFee" TYPE DOUBLE PRECISION;
ALTER TABLE "ShopSettings" ALTER COLUMN "freeShipOver" TYPE DOUBLE PRECISION;

-- ─── Coupon ───
ALTER TABLE "Coupon" ALTER COLUMN "value" TYPE DOUBLE PRECISION;
ALTER TABLE "Coupon" ALTER COLUMN "minSubtotal" TYPE DOUBLE PRECISION;
ALTER TABLE "Coupon" ALTER COLUMN "maxDiscount" TYPE DOUBLE PRECISION;

-- ─── ShippingZone ───
ALTER TABLE "ShippingZone" ALTER COLUMN "fee" TYPE DOUBLE PRECISION;

-- ─── OnlineOrder / OnlineOrderLine / PaymentAttempt ───
ALTER TABLE "OnlineOrder" ALTER COLUMN "subtotal" TYPE DOUBLE PRECISION;
ALTER TABLE "OnlineOrder" ALTER COLUMN "shippingFee" TYPE DOUBLE PRECISION;
ALTER TABLE "OnlineOrder" ALTER COLUMN "discount" TYPE DOUBLE PRECISION;
ALTER TABLE "OnlineOrder" ALTER COLUMN "total" TYPE DOUBLE PRECISION;
ALTER TABLE "OnlineOrderLine" ALTER COLUMN "unitPrice" TYPE DOUBLE PRECISION;
ALTER TABLE "OnlineOrderLine" ALTER COLUMN "lineTotal" TYPE DOUBLE PRECISION;
ALTER TABLE "PaymentAttempt" ALTER COLUMN "amount" TYPE DOUBLE PRECISION;
