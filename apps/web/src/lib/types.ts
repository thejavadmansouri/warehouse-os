// تمام تایپ‌های پروژه — منبع: سند مشخصات API (بخش‌های ۴ تا ۶.۱۲)
// هر تایپ با کامنت بخش مربوطه نشانه‌گذاری شده.

// طبق بخش ۴
export type Role = "ADMIN" | "MANAGER" | "STAFF" | "SALES";

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
}

// طبق بخش ۴ — POST /auth/login
export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface AuthMeResponse {
  sub: string;
  username: string;
  role: Role;
  // فیلدهای احتمالی اضافی که /auth/me برمی‌گرداند (fullName و ...)
  fullName?: string;
  id?: string;
}

// طبق بخش ۵ — ساختار خطای یکسان
export interface ApiErrorBody {
  error: string;
  message?: string;
  available?: number;
  /** فیلدهای اختصاصی هر خطا — مثلاً lineIndex در INSUFFICIENT_STOCK. */
  [key: string]: unknown;
}

// طبق بخش ۶.۳ — محصولات
export interface Product {
  id: string;
  name: string;
  sku: string;
  internalBarcode?: string | null;
  factoryBarcode?: string | null;
  partNumber?: string | null;
  description?: string | null;
  unit?: string | null;
  weight?: number | null;
  brandId?: string | null;
  categoryId?: string | null;
  vehicleModelId?: string | null;
  supplierId?: string | null;
  purchasePrice?: number | null;
  salePrice?: number | null;
  wholesalePrice?: number | null;
  minStock?: number | null;
  isActive?: boolean;
  image?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // روابط احتمالی جوین‌شده
  brand?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  vehicleModel?: { id: string; name: string } | null;
  /**
   * تاریخچه‌ی قیمت، جدیدترین اول. سرور معمولاً فقط آخرین ردیف را می‌فرستد.
   * قیمت واقعی اینجاست، نه در فیلدهای تختِ بالا — آن‌ها فقط ورودیِ فرم ساخت
   * کالا هستند و در پاسخ‌ها پر نمی‌شوند.
   */
  prices?: ProductPrice[];
}

export interface CreateProductDto {
  name: string;
  sku: string;
  internalBarcode?: string;
  factoryBarcode?: string;
  partNumber?: string;
  description?: string;
  unit?: string;
  weight?: number;
  brandId?: string;
  categoryId?: string;
  vehicleModelId?: string;
  supplierId?: string;
  purchasePrice?: number;
  salePrice?: number;
  wholesalePrice?: number;
  minStock?: number;
  isActive?: boolean;
  image?: string;
}

export type UpdateProductDto = Partial<CreateProductDto>;

// طبق بخش ۶.۴ — برندها
export interface Brand {
  id: string;
  name: string;
  aliases?: string[] | string | null;
  createdAt?: string;
}

// طبق بخش ۶.۵ — مدل‌های خودرو
export interface VehicleModel {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  systemType?: string | null;
  createdAt?: string;
}

export interface CreateVehicleModelDto {
  name: string;
  startYear: number;
  endYear: number;
  systemType?: string;
}

// طبق مدل واقعی بک‌اند (Prisma) — هر انبار سطوح موقعیت خودش را با یک نام
// آزاد و یک عمق عددی (depth) تعریف می‌کند؛ enum سطح ثابت وجود ندارد.
export interface Warehouse {
  id: string;
  name: string;
  code: string;
  isActive?: boolean;
}

export interface LocationType {
  id: string;
  warehouseId: string;
  name: string;
  depth: number;
  createdAt?: string;
}

export interface CreateLocationTypeDto {
  warehouseId: string;
  name: string;
  depth: number;
}

// طبق LocationBuilderService — تولید گروهی درخت موقعیت‌ها
export interface GenerateLocationTreeLevel {
  locationTypeId: string;
  count: number;
  naming?: "numeric" | "alpha";
  prefix?: string;
}

export interface GenerateLocationTreeDto {
  warehouseId: string;
  parentId?: string;
  levels: GenerateLocationTreeLevel[];
}

export interface GenerateLocationTreeResult {
  createdCount: number;
  skippedCount: number;
  leafCount: number;
}

export interface Location {
  id: string;
  name: string;
  typeId: string;
  parentId?: string | null;
  warehouseId?: string | null;
  code?: string | null;
  barcode?: string | null;
  path?: string | null;
  depth?: number;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string;
  type?: LocationType | null;
  parent?: { id: string; name: string } | null;
  // findChildren برمی‌گرداند تا UI درخت بداند این گره فرزند دارد (فلش expand)
  _count?: { children: number };
}

export interface CreateWarehouseDto {
  name: string;
  code: string;
}

export interface UpdateWarehouseDto {
  name?: string;
}

// خروجی GET /locations/:id/subtree-stats — برای دیالوگ تأیید حذف
export interface LocationSubtreeStats {
  id: string;
  name: string;
  descendantCount: number;
  totalCount: number;
  hasHistory: boolean;
  willDeactivate: boolean;
}

export interface DeleteLocationResult {
  mode: "deleted" | "deactivated";
  affected: number;
  message: string;
}

export interface BulkDeleteLocationsResult {
  deletedCount: number;
  deactivatedCount: number;
  message: string;
}

export interface DeleteWarehouseResult {
  mode: "deleted" | "deactivated";
  locationCount: number;
  message: string;
}

export interface CreateLocationDto {
  name: string;
  typeId: string;
  parentId?: string;
  warehouseId?: string;
  code?: string;
  barcode?: string;
}

// طبق بخش ۶.۷ — موجودی
// ⚠️ نکته: شکل دقیق InventoryRow و InventoryLogRow در سند نیامده؛
// فیلدهای منطقی مدل شده‌اند و UI به‌صورت defensive رندر می‌شود.
export interface InventoryRow {
  id: string;
  productId: string;
  locationId: string;
  quantity: number;
  updatedAt?: string;
  product?: {
    id: string;
    name: string;
    sku?: string;
    partNumber?: string | null;
    unit?: string | null;
  } | null;
  location?: {
    id: string;
    name: string;
    code?: string | null;
    barcode?: string | null;
  } | null;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// GET /inventory/current-stock → { data, meta }
export interface CurrentStockResponse {
  data: InventoryRow[];
  meta: PaginatedMeta;
}

export type InventoryAction =
  | "IN"
  | "OUT"
  | "TRANSFER"
  | "ADJUST"
  | "SALE"
  | "RETURN"
  | "COUNT";

export interface InventoryLogRow {
  id: string;
  productId: string;
  locationId: string;
  action: InventoryAction;
  quantity: number;
  note?: string | null;
  userId?: string | null;
  createdAt: string;
  product?: { id: string; name: string; sku?: string } | null;
  location?: { id: string; name: string; code?: string | null } | null;
  user?: { id: string; username: string; fullName?: string } | null;
}

// GET /inventory/logs → { items, total, page, limit } (دقت: کلید items است نه data)
export interface InventoryLogsResponse {
  items: InventoryLogRow[];
  total: number;
  page: number;
  limit: number;
}

export interface InventoryLogsQuery {
  productId?: string;
  locationId?: string;
  action?: InventoryAction;
  from?: string; // ISO date
  to?: string; // ISO date
  page?: number;
  limit?: number;
}

// POST /inventory و POST /inventory/out
export interface InventoryOperationDto {
  productId: string;
  locationId: string;
  quantity: number;
  note?: string;
}

export interface ScanOutDto {
  barcode: string;
  locationId: string;
  quantity: number;
  note?: string;
}

// طبق بخش ۶.۷ — انتقال
export interface InventoryTransferDto {
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
}

// طبق بخش ۶.۸ — ورود صوتی
export interface VoiceSessionStartDto {
  warehouseId?: string;
}

export interface VoiceSession {
  id: string;
  [key: string]: unknown;
}

export interface VoiceInputDto {
  locationBarcode: string;
  text: string;
  sessionId: string;
}

export interface VoiceSuccessResponse {
  success: true;
  [key: string]: unknown;
}

export interface VoiceNeedSelectionResponse {
  success: false;
  needSelection: true;
  message: string;
  parsed: Record<string, unknown>;
  suggestions: unknown[];
}

export type VoiceResponse = VoiceSuccessResponse | VoiceNeedSelectionResponse;

// مسیر شمارش صوتی (mobile/count)
export interface CountStartDto {
  locationBarcode: string;
}

export interface CountStartResponse {
  sessionId: string;
  countId: string;
  location: Record<string, unknown>;
}

export interface CountVoiceDto {
  text: string;
}

export interface CountVoiceResponse {
  success: boolean;
  matched: boolean;
  matchedProduct: { id: string; name: string } | null;
  item: Record<string, unknown> | null;
  explanation: {
    confidence?: number;
    goodQuantity?: number;
    badQuantity?: number;
    [key: string]: unknown;
  } | null;
}

// طبق بخش ۶.۹ — انبارگردانی
export interface CreateInventoryCountDto {
  sessionId: string;
  locationId: string;
  userId?: string;
}

export interface CreateInventoryCountItemDto {
  productId?: string;
  name: string;
  categoryId?: string;
  brandId?: string;
  vehicleModelId?: string;
  goodQuantity?: number;
  badQuantity?: number;
  note?: string;
  voiceText?: string;
}

export interface InventoryCount {
  id: string;
  sessionId: string;
  locationId: string;
  userId?: string | null;
  status?: string;
  createdAt?: string;
  finishedAt?: string | null;
  location?: { id: string; name: string } | null;
  items?: InventoryCountItem[];
}

export interface InventoryCountItem {
  id: string;
  countId: string;
  productId?: string | null;
  name: string;
  categoryId?: string | null;
  brandId?: string | null;
  vehicleModelId?: string | null;
  goodQuantity?: number;
  badQuantity?: number;
  note?: string | null;
  voiceText?: string | null;
  product?: { id: string; name: string } | null;
}

// طبق بخش ۶.۱۰ — کاربران
export interface CreateUserDto {
  username: string;
  password: string;
  fullName: string;
  role: Role;
}

export interface UpdateRoleDto {
  role: Role;
}

export interface UpdatePasswordDto {
  password: string;
}

// طبق بخش ۶.۱۲ — کاتالوگ قطعات
export interface PartCatalog {
  id: string;
  name: string;
  aliases?: string[] | null;
  unit?: string | null;
  createdAt?: string;
}

export interface CreatePartCatalogDto {
  name: string;
  aliases?: string[];
  unit?: string;
}

// طبق بخش ۶.۱۱ — ورود اکسل
export interface ImportPreviewRow {
  [key: string]: unknown;
}

export interface ImportUploadResponse {
  id: string;
  preview?: ImportPreviewRow[];
  [key: string]: unknown;
}

export interface ImportConfirmDto {
  createMissingEntities?: boolean;
}

// دسته‌بندی‌ها و تامین‌کننده‌ها (در سند صریح نیامد ولی فیلدهای productId به‌شان ارجاع داده)
export interface Category {
  id: string;
  name: string;
  createdAt?: string;
}

export interface Supplier {
  id: string;
  name: string;
  createdAt?: string;
}

// =====================================================
// افزونه: چاپ لیبل (طبق بخش الف سند افزونه)
// =====================================================

// GET /labels/location/:id و POST /labels/location/bulk
export interface LocationLabel {
  id: string;
  name: string;
  code: string;
  barcode: string;
  warehouseName: string | null;
  pathText: string;
  qrCode: string; // data:image/png;base64,...
}

// GET /labels/product/:id و POST /labels/product/bulk
export interface ProductLabel {
  id: string;
  name: string;
  sku: string;
  brandName: string | null;
  vehicleModelName: string | null;
  barcode: string;
  qrCode: string; // data:image/png;base64,...
}

// =====================================================
// افزونه: تأیید انتخاب دستی صوت (طبق بخش ب سند افزونه)
// =====================================================

// POST /inventory/voice/confirm
export interface VoiceConfirmDto {
  productId: string;
  locationBarcode: string;
  quantity?: number; // اگر ندی، سرور ۱ در نظر می‌گیرد
  sessionId: string;
  note?: string;
}

export interface VoiceConfirmResponse {
  success: true;
  productId: string;
  location: { id: string; name: string; [k: string]: unknown } | null;
  inventory: { id: string; quantity: number; [k: string]: unknown } | null;
}

// غنی‌سازی پاسخ موفق /inventory/voice (طبق بخش ب سند افزونه)
// فیلدهای اضافی اختیاری — endpoint فعلی ممکن است همه را برنگرداند،
// UI به‌صورت defensive رندر می‌کند.
export interface VoiceSuccessData {
  success: true;
  parsed?: Record<string, unknown> | null;
  product?: { id: string; name: string; sku?: string } | null;
  quantity?: number;
  location?: { id: string; name: string } | null;
  inventory?: { id: string; quantity: number } | null;
  [key: string]: unknown;
}

export interface VoiceSuggestion {
  id: string;
  name: string;
  sku?: string;
  [key: string]: unknown;
}

// عملیات در انتظار تأیید مدیر (Stage 3 — sync/approval)
export interface PendingOperation {
  id: string;
  clientRequestId: string;
  status: string;
  type: string;
  locationBarcode: string;
  voiceText?: string | null;
  parsed?: {
    parsed?: Record<string, unknown> | null;
    suggestions?: { id: string; name: string; confidence?: number }[];
  } | null;
  quantity: number;
  unit?: string | null;
  warehouseId?: string | null;
  productId?: string | null;
  createdAt: string;
  location?: {
    id: string;
    name: string;
    code?: string | null;
    barcode?: string | null;
    path?: string | null;
    warehouse?: { id: string; name: string; code?: string } | null;
  } | null;
  product?: {
    id: string;
    name: string;
    sku?: string;
    internalBarcode?: string;
    brand?: { id: string; name: string } | null;
    barcodes?: { barcode: string; type?: string }[];
  } | null;
  worker?: { id: string; username: string; fullName?: string } | null;
}

export interface ProductCreationRequest {
  id: string;
  status: string; // PENDING | APPROVED | REJECTED
  name: string;
  brandName?: string | null;
  categoryId?: string | null;
  vehicles: string[];
  quantity: number;
  unit: string;
  notes?: string | null;
  voiceText?: string | null;
  locationBarcode?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  category?: { id: string; name: string } | null;
  location?: {
    id: string;
    name: string;
    path?: string | null;
    warehouse?: { id: string; name: string } | null;
  } | null;
  worker?: { id: string; username: string; fullName?: string } | null;
  reviewedBy?: { id: string; username: string; fullName?: string } | null;
  createdProduct?: { id: string; name: string; sku: string } | null;
}

export interface ApproveProductRequestDto {
  name?: string;
  brandName?: string;
  categoryId?: string;
  vehicles?: string[];
  quantity?: number;
  unit?: string;
}


// =====================================================
// فروش — فاکتور، مشتری، پرداخت، کار برداشت
// =====================================================

export type PaymentMethod = "CASH" | "CARD" | "CHEQUE" | "CREDIT";
export type InvoiceStatus = "CONFIRMED" | "CANCELLED";
export type PickTaskStatus = "PENDING" | "PICKED" | "CANCELLED";

/** یک مکان با موجودی مثبت — فروش فقط از این مکان‌ها ممکن است. */
export interface StockLocation {
  locationId: string;
  locationName: string;
  locationCode: string;
  locationBarcode: string;
  locationPath: string;
  quantity: number;
}

/** یک مکانِ موجودی‌دار در نتیجه‌ی جست‌وجوی زنده (شکل خروجی /products/locate). */
export interface LocateLocation {
  locationId: string;
  name: string;
  code: string;
  path: string;
  quantity: number;
}

/** GET /products/locate — کالا + خلاصه‌ی موجودی و آدرس قفسه، در یک درخواست. */
export interface LocateResult {
  id: string;
  name: string;
  sku: string;
  unit: string | null;
  partNumber: string | null;
  salePrice: number | null;
  brandName: string | null;
  vehicleModelName: string | null;
  totalStock: number;
  locations: LocateLocation[];
}

export interface SaleResolve {
  product: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
    salePrice?: number | null;
  };
  stock: StockLocation[];
}

export interface CustomerPhone {
  id: string;
  phone: string;
  label?: string | null;
  isPrimary: boolean;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName?: string | null;
  fullName: string;
  note?: string | null;
  smsOptOut?: boolean;
  phones: CustomerPhone[];
  summary?: { totalPurchased: number; totalDue: number };
  invoices?: InvoiceListRow[];
}

export interface ChequeInput {
  number: string;
  bankName?: string;
  branch?: string;
  holderName?: string;
  /** ISO — تبدیل شمسی سمت کلاینت انجام می‌شود */
  dueDate: string;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  note?: string;
  cheque?: ChequeInput;
}

export interface InvoiceLineInput {
  productId: string;
  locationId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface CreateInvoiceDto {
  idempotencyKey: string;
  warehouseId: string;
  customerId?: string | null;
  customer?: { firstName: string; lastName?: string; phone?: string } | null;
  discount?: number;
  note?: string;
  lines: InvoiceLineInput[];
  payments?: PaymentInput[];
}

export interface Invoice {
  id: string;
  number: number;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  profit?: number | null;
  status: InvoiceStatus;
  note?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  customer?: Customer | null;
  warehouse?: { id: string; name: string; code: string };
  user?: { id: string; fullName: string } | null;
  payments: {
    id: string;
    method: PaymentMethod;
    amount: number;
    note?: string | null;
    cheque?: { number: string; bankName?: string | null; dueDate: string } | null;
  }[];
  lines: {
    id: string;
    quantity: number;
    unitPrice?: number | null;
    /**
     * تخفیف همین ردیف به تومان.
     * برای فاکتورهای پیش از افزوده‌شدن این ستون null است — در آن حالت فقط
     * سرجمعِ تخفیف‌های ردیفی از اختلاف جمع ردیف‌ها با subtotal قابل استخراج است.
     */
    lineDiscount?: number | null;
    product: { id: string; name: string; sku?: string | null; unit?: string | null };
    location: { id: string; name: string; code: string; path: string };
  }[];
}

export interface InvoiceListRow {
  id: string;
  number: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  status: InvoiceStatus;
  createdAt: string;
}

/** بدنه‌ی خطای ۴۰۹ کمبود موجودی — شماره‌ی ردیف را می‌دهد تا همان ردیف قرمز شود. */
export interface InsufficientStockError {
  error: "INSUFFICIENT_STOCK";
  lineIndex: number;
  productId: string;
  locationId: string;
  requested: number;
  available: number;
  message: string;
}

export interface PickTask {
  id: string;
  quantity: number;
  status: PickTaskStatus;
  note?: string | null;
  createdAt: string;
  product: { id: string; name: string; sku?: string | null; unit?: string | null };
  location: { id: string; name: string; code: string; barcode: string; path: string };
  requestedBy?: { id: string; fullName: string } | null;
  pickedBy?: { id: string; fullName: string } | null;
}

// =====================================================
// گزارش‌ها — دقیقاً مطابق آنچه سرور برمی‌گرداند
// =====================================================

export interface ReportMeta {
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export interface PeriodicSalesReport {
  summary: { totalAmount: number; invoiceCount: number; averageInvoiceAmount: number };
  /** تاریخ ISO است؛ برچسب شمسی سمت کلاینت ساخته می‌شود. */
  chartData: { date: string; amount: number; count: number }[];
  invoices: {
    data: {
      id: string;
      number: number;
      createdAt: string;
      customerName: string | null;
      sellerName: string | null;
      amount: number;
      itemCount: number;
    }[];
    meta: ReportMeta;
  };
}

export interface PeriodicProfitReport {
  summary: {
    totalRevenue: number;
    totalCost: number;
    grossProfit: number;
    profitMarginPercent: number;
  };
  /** بهای تفکیکی از آخرین قیمت خرید می‌آید، نه قیمت لحظه‌ی فروش. */
  costIsApproximate: boolean;
  items: {
    data: {
      productId: string;
      productName: string;
      sku: string;
      quantitySold: number;
      totalRevenue: number;
      totalCost: number;
      profit: number;
      marginPercent: number;
    }[];
    meta: ReportMeta;
  };
}

export interface DebtorsReport {
  summary: { totalDebtors: number; totalCreditBalance: number };
  debtors: {
    data: {
      customerId: string;
      customerName: string;
      phone: string | null;
      creditBalance: number;
      lastInvoiceAt: string;
    }[];
    meta: ReportMeta;
  };
}

export interface ChequesReport {
  summary: { totalCount: number; totalAmount: number };
  cheques: {
    data: {
      id: string;
      number: string;
      bankName: string | null;
      holderName: string | null;
      amount: number;
      dueDate: string;
      status: string;
      invoiceNumber: number;
    }[];
    meta: ReportMeta;
  };
}

export interface ProductPerformanceReport {
  products: {
    data: {
      productId: string;
      productName: string;
      sku: string;
      currentStock: number;
      quantitySold: number;
      totalSalesAmount: number;
      lastSoldAt: string | null;
    }[];
    meta: ReportMeta;
  };
}

export interface LowStockReport {
  summary: { totalLowStockItems: number };
  items: {
    data: {
      productId: string;
      productName: string;
      sku: string;
      currentStock: number;
      minStock: number;
      shortage: number;
    }[];
    meta: ReportMeta;
  };
}

export interface SellerPerformanceReport {
  sellers: {
    data: {
      sellerId: string;
      sellerName: string;
      totalInvoices: number;
      totalSalesAmount: number;
      totalProfit: number;
      averageInvoiceAmount: number;
      cancelledInvoicesCount: number;
    }[];
    meta: ReportMeta;
  };
}

// =====================================================
// دریافت وجه، پیش‌فاکتور، بک‌آپ
// =====================================================

export interface ReceiptAllocation {
  id: string;
  amount: number;
  invoice: { id: string; number: number; total: number };
}

export interface Receipt {
  id: string;
  number: number;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  createdAt: string;
  customerName: string;
  customer?: { id: string; firstName: string; lastName?: string | null };
  user?: { fullName: string } | null;
  cheque?: { number: string; dueDate: string; status: string } | null;
  allocations?: ReceiptAllocation[];
}

export type QuotationStatus = "ACTIVE" | "CONVERTED" | "CANCELLED";

export interface Quotation {
  id: string;
  number: number;
  subtotal: number;
  discount: number;
  total: number;
  validUntil: string;
  status: QuotationStatus;
  /** «منقضی» وضعیت ذخیره‌شده نیست؛ سرور آن را از تاریخ حساب می‌کند. */
  displayStatus: QuotationStatus | "EXPIRED";
  isExpired: boolean;
  remainingMinutes: number;
  customerName: string | null;
  note?: string | null;
  convertedInvoiceId?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
  _count?: { lines: number };
  lines?: {
    id: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    product: { id: string; name: string; sku?: string | null; unit?: string | null };
  }[];
}

export interface BackupConfig {
  id: string;
  enabled: boolean;
  destination: string;
  hour: number;
  minute: number;
  keepCount: number;
  remindAfterHours: number;
}

export interface BackupStatus {
  lastSuccessAt: string | null;
  lastFilePath: string | null;
  lastVerified: boolean;
  hoursSinceLastBackup: number | null;
  shouldRemind: boolean;
  isRunning: boolean;
  config: BackupConfig;
}

export interface BackupRun {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  trigger: string;
  filePath: string | null;
  sizeBytes: number | null;
  verified: boolean;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

// =====================================================
// صف چاپ لیبل
// =====================================================

export interface PendingLabelProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  brandName: string | null;
  createdAt: string;
  stock: number;
}

export interface LabelSettings {
  id: string;
  columns: number;
  widthMm: number;
  heightMm: number;
  gapMm: number;
  showName: boolean;
  showBarcodeText: boolean;
  cropMarks: boolean;
}


export interface Worker {
  id: string;
  fullName: string;
  username: string;
}

// ---------------------------------------------------------------------------
// قیمت‌گذاری
// ---------------------------------------------------------------------------

/** یک ردیف تاریخچه‌ی قیمت. قیمت‌ها تومان و عدد صحیح‌اند. */
export interface ProductPrice {
  id: string;
  productId: string;
  purchasePrice: number | null;
  salePrice: number | null;
  wholesalePrice: number | null;
  createdAt: string;
}

/** کدام کالاها قیمت بگیرند. بدون هیچ معیاری، سرور درخواست را رد می‌کند. */
export interface BulkPriceSelect {
  productIds?: string[];
  brandId?: string;
  categoryId?: string;
  search?: string;
  /** فقط کالاهایی که هنوز قیمت فروش ندارند — محدودکننده، نه معیارِ مستقل. */
  onlyWithoutSalePrice?: boolean;
}

/**
 * set     — مقدار مطلق روی فیلدهای داده‌شده
 * percent — همان فیلد را درصدی کم/زیاد کن
 * markup  — قیمت فروش = قیمت خرید × (۱ + درصد/۱۰۰)
 */
export interface BulkPriceOp {
  kind: "set" | "percent" | "markup";
  purchasePrice?: number;
  salePrice?: number;
  wholesalePrice?: number;
  field?: "purchasePrice" | "salePrice" | "wholesalePrice";
  percent?: number;
}

export interface BulkPriceRequest {
  select: BulkPriceSelect;
  op: BulkPriceOp;
  dryRun?: boolean;
}

export interface BulkPriceResult {
  /** چند کالا با این معیار پیدا شد. */
  matched: number;
  /** چند تا واقعاً قیمت جدید گرفتند. */
  updated: number;
  /** بی‌تغییر یا بدون مبنای محاسبه (مثلاً قیمت خرید نداشت). */
  skipped: number;
  dryRun: boolean;
}
