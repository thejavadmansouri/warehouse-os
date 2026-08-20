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
  /** ValidationPipe نست به‌جای یک رشته، آرایه‌ای از خطاهای فیلدها می‌دهد. */
  message?: string | string[];
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
  // تعداد قفسه‌های زیر انبار — findAll/inactive تختش می‌کنند. اگر > 0 باشد،
  // کد قابل ویرایش نیست (روی لیبل‌ها چاپ شده).
  locationCount?: number;
}

export interface ReactivateWarehouseResult {
  mode: "reactivated" | "already-active";
  message: string;
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
  // فقط وقتی انبار هیچ قفسه‌ای ندارد پذیرفته می‌شود (سرور بررسی می‌کند).
  code?: string;
}

// خروجی GET /locations/:id/subtree-stats — برای دیالوگ تأیید حذف
export interface LocationSubtreeStats {
  id: string;
  name: string;
  descendantCount: number;
  totalCount: number;
  hasHistory: boolean;
  willDeactivate: boolean;
  // موجودیِ زنده‌ی نشسته روی این شاخه — اگر hasStock باشد، حذف بدون تعیینِ
  // تکلیفِ موجودی (انتقال/تصفیه) رد می‌شود.
  stockUnits: number;
  stockProducts: number;
  stockLocations: number;
  hasStock: boolean;
}

/** تصمیمِ تکلیفِ موجودی هنگام حذفِ قفسه‌ی دارای موجودی. */
export interface RemoveLocationStockOptions {
  stockAction: "transfer" | "writeoff";
  destinationLocationId?: string;
  reason?: string;
}

export interface DeleteLocationResult {
  mode: "deleted" | "deactivated";
  affected: number;
  movedUnits?: number;
  stockAction?: "transfer" | "writeoff" | null;
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

// GET /inventory/kardex/:productId — گردش کالا با مانده‌ی متحرک
export interface KardexRow {
  id: string;
  createdAt: string;
  action: InventoryAction;
  docType: "SALE" | "PURCHASE" | "RETURN" | "MANUAL";
  /** شناسه‌ی سندِ منبع — برای لینک به جزئیات فاکتور فروش. */
  docId: string | null;
  docNumber: number | null;
  locationName: string | null;
  inQty: number;
  outQty: number;
  balance: number;
  unitPrice: number | null;
}

/** خلاصه‌ی بازه‌ی کاردکس — جمعِ وارد/خارج و فروش‌ها (بدون در نظر گرفتن فیلترِ action). */
export interface KardexSummary {
  totalIn: number;
  totalOut: number;
  saleCount: number;
  saleValue: number;
}

export interface KardexResponse {
  product: { id: string; name: string; sku: string };
  currentStock: number;
  summary: KardexSummary;
  rows: {
    data: KardexRow[];
    meta: { total: number; page: number; limit: number; lastPage: number };
  };
}

export interface KardexQuery {
  startDate?: string;
  endDate?: string;
  action?: InventoryAction;
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
export type InvoiceStatus = "OPEN" | "CONFIRMED" | "CANCELLED";
export type PickTaskStatus = "PENDING" | "PICKED" | "CANCELLED";

/** یک مکان با موجودی مثبت — فروش فقط از این مکان‌ها ممکن است. */
export interface StockLocation {
  locationId: string;
  locationName: string;
  locationCode: string;
  locationBarcode: string;
  locationPath: string;
  quantity: number;
  // قفسه‌اش حذف/غیرفعال شده ولی جنس رویش مانده.
  stranded?: boolean;
}

/** یک مکانِ موجودی‌دار در نتیجه‌ی جست‌وجوی زنده (شکل خروجی /products/locate). */
export interface LocateLocation {
  locationId: string;
  name: string;
  code: string;
  path: string;
  quantity: number;
  // قفسه حذف/غیرفعال شده ولی جنس رویش مانده.
  stranded?: boolean;
}

/** GET /products/locate — کالا + خلاصه‌ی موجودی و آدرس قفسه، در یک درخواست. */
/** One catalog row for the POS local search (GET /products/pos-catalog). */
export interface PosCatalogRow {
  id: string;
  name: string;
  sku: string | null;
  partNumber: string | null;
  unit: string | null;
  isActive: boolean;
  searchTokens: string[];
  barcodes: string[];
  brand: string | null;
  vehicleModel: string | null;
  salePrice: number | null;
  updatedAt: string;
  deleted: boolean;
}

export interface PosCatalogPage {
  products: PosCatalogRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

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
  /** آدرس مشتری — برای پیک و پیامک و صورتحساب. */
  address?: string | null;
  /** شماره ملی. */
  nationalId?: string | null;
  /** دسته‌ی مشتری — ارجاع به CustomerCategory. */
  categoryId?: string | null;
  category?: CustomerCategory | null;
  note?: string | null;
  smsOptOut?: boolean;
  phones: CustomerPhone[];
  /** سقف اعتبار حساب‌باز (ریال). صفر = تعیین‌نشده. */
  creditLimit?: number;
  /** مهلت پرداخت پیش‌فرض به روز. */
  creditDays?: number;
  /** نرخِ فروشِ مدت‌دار برای چکِ این مشتری، به پایه‌ی هزارم. صفر = از فروشگاه. */
  chequeRateBp?: number;
  chequeRateMode?: "FLAT" | "MONTHLY";
  summary?: CustomerSummary;
  invoices?: InvoiceListRow[];
}

/** دسته‌ی مشتری — چیزی که مدیر تعریف می‌کند. */
export interface CustomerCategory {
  id: string;
  name: string;
  /** رنگ badge — HEX مثل `#16a34a`. */
  color: string;
  /** ترتیب نمایش — کم‌تر اول. */
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** تعداد مشتری‌های این دسته — فقط در لیست مدیریت می‌آید. */
  _count?: { customers: number };
}

/** آمار خرید دوره‌ای مشتری — خروجی GET /sales/customers/:id/stats. */
export interface CustomerPurchaseStats {
  thisMonth: { total: number; count: number };
  lastMonth: { total: number; count: number };
  allTime: { total: number; count: number };
  /** میانگین مبلغ هر فاکتور تأییدشده. */
  averageInvoice: number;
}

/**
 * خلاصه‌ی حساب مشتری.
 *
 * `totalDue` از دفتر حساب می‌آید (مانده‌ی اول دوره و برگشتی را هم می‌بیند)، ولی
 * تفکیک جاری/سررسید/معوق از سررسیدِ فاکتورهاست. این دو نباید قاطی شوند.
 */
export interface CustomerSummary {
  totalPurchased: number;
  /** مانده‌ی واقعی. مثبت یعنی بدهکار. */
  totalDue: number;
  /** هنوز مهلت دارد. */
  current: number;
  dueToday: number;
  overdue: number;
  /** چکِ دریافت‌شده‌ای که هنوز وصول نشده. */
  chequesInHandCount: number;
}

/** یک ردیف گردش حساب. */
export type LedgerEntryType =
  | "OPENING"
  | "INVOICE"
  | "RECEIPT"
  | "INVOICE_CANCELLED"
  | "RETURN"
  | "CORRECTION"
  | "CHEQUE_BOUNCED"
  | "CHEQUE_CASHED"
  | "FINANCE_CHARGE"
  | "ADJUSTMENT";

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  /** مثبت = بدهی زیاد شده، منفی = کم شده. */
  amount: number;
  note?: string | null;
  createdAt: string;
  invoice?: { id: string; number: number } | null;
  receipt?: { id: string; number: number } | null;
  user?: { id: string; fullName: string } | null;
}

/** یک ردیف صورتحساب — بدهکار/بستانکار جدا + مانده‌ی متحرک از سمت سرور. */
export interface LedgerEntryRow extends LedgerEntry {
  debit: number;
  credit: number;
  balance: number;
}

/** خلاصه‌ی بازه‌ی صورتحساب. */
export interface StatementSummary {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface StatementResponse {
  rows: {
    data: LedgerEntryRow[];
    meta: { total: number; page: number; limit: number; lastPage: number };
  };
  summary: StatementSummary;
}

/** مشخصات مغازه — سربرگ همه‌ی برگه‌های چاپی. */
export interface ShopSettings {
  name: string;
  phone: string;
  address: string;
  cardNumber: string;
  cardHolder: string;
  footer: string;
  /** پیش‌فرضِ نرخِ فروشِ مدت‌دار، به پایه‌ی هزارم. ۲۵۰ = ۲.۵٪ */
  chequeRateBp: number;
  chequeRateMode: "FLAT" | "MONTHLY";
}

/** یک مشتریِ دارای حساب باز، با تفکیک سنیِ بدهی‌اش. */
export interface Debtor {
  id: string;
  fullName: string;
  phone: string | null;
  creditLimit: number;
  creditDays: number;
  totalDue: number;
  /** null یعنی سقف اعتباری تعیین نشده. */
  available: number | null;
  current: number;
  dueToday: number;
  overdue: number;
  nextDueDate: string | null;
}

export interface ReceivablesSummary {
  customerCount: number;
  totalDue: number;
  current: number;
  dueToday: number;
  overdue: number;
}

/** اعلان‌ها — عمداً کم و مشخص، فقط چیزهایی که کسی رویشان عمل می‌کند. */
export interface Alerts {
  overdue: {
    customerCount: number;
    amount: number;
    top: { id: string; fullName: string; amount: number }[];
  };
  cheques: {
    count: number;
    withinDays: number;
    items: { id: string; number: string; dueDate: string }[];
  };
}

/** نتیجه‌ی بررسی سقف اعتبار. هشدار است، نه مانع. */
export interface CreditCheck {
  limit: number;
  currentDebt: number;
  projected: number;
  /** null یعنی سقفی تعیین نشده. */
  available: number | null;
  exceeded: boolean;
  exceededBy: number;
}

export interface ChequeInput {
  number: string;
  bankName?: string;
  branch?: string;
  holderName?: string;
  /** ISO — تبدیل شمسی سمت کلاینت انجام می‌شود */
  dueDate: string;

  /*
   * تفاوتِ فروشِ مدت‌دار.
   *
   * قرارداد با سرور: `amount` سطرِ پرداخت **پایه** است (چقدر از صورتحساب/بدهی را
   * می‌پوشاند). سود جدا می‌رود و مبلغی که روی کاغذِ چک نوشته می‌شود پایه + سود
   * است. نفرستادنِ `rateBp` یعنی «بدونِ سود» — سرور هیچ پیش‌فرضی از روی مشتری
   * برنمی‌دارد.
   */
  /** نرخ به پایه‌ی هزارم. ۲۵۰ = ۲.۵٪ */
  rateBp?: number;
  months?: number;
  rateMode?: "FLAT" | "MONTHLY";
  /** مبلغِ دستیِ سود، وقتی فروشنده گردش کرده. نیامدنش یعنی از نرخ حساب شود. */
  charge?: number;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  note?: string;
  cheque?: ChequeInput;
}

export interface InvoiceLineInput {
  productId: string;
  /** نبودنش یعنی کالا هنوز در سیستم ثبت نشده؛ سرور مکان سیستمی را انتخاب می‌کند. */
  locationId?: string;
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
  /** سررسید بخش حساب‌باز (ISO). نفرستادنش = مهلت پیش‌فرضِ همین مشتری. */
  dueDate?: string;
  lines: InvoiceLineInput[];
  payments?: PaymentInput[];
  /**
   * حساب بازِ مالکِ این فاکتور. اگر پر باشد فاکتور OPEN (جاری) ثبت می‌شود،
   * پرداختی نمی‌پذیرد، و مشتری باید همان مشتریِ حساب باشد. تا تسویه نهایی
   * نمی‌شود.
   */
  accountId?: string;
}

/** یک ردیفِ فاکتورِ حساب باز — با تاریخِ دقیقِ همان قلم. */
export interface OpenAccountLine {
  id: string;
  /** همان شناسه‌ای که مرجوعی و اصلاحیه رویش قفل می‌شوند. */
  saleLogId: string;
  invoiceId: string;
  invoiceNumber: number;
  productId: string;
  productName: string;
  unit: string | null;
  /** آنچه در آن نوبت برداشته شد — دست‌نخورده می‌ماند. */
  quantity: number;
  returnedQuantity: number;
  correctedQuantity: number;
  /** آنچه واقعاً روی حساب مانده: برداشته + اصلاح − مرجوعی. */
  effectiveQuantity: number;
  /** قیمتِ فعلی (آخرین اصلاحیه، وگرنه قیمتِ فروش). */
  unitPrice: number;
  originalUnitPrice: number;
  discount: number;
  createdAt: string;
}

/** یک نوبتِ خرید (فاکتورِ OPEN) داخل حساب باز. */
export interface OpenAccountInvoice {
  id: string;
  number: number;
  /** ناخالص — آنچه در این نوبت برداشته شد. */
  total: number;
  /** خالص، پس از مرجوعی و اصلاحیه‌ی پیش از تسویه. */
  netTotal: number;
  discount: number;
  note: string | null;
  createdAt: string;
  lines: OpenAccountLine[];
}

/** ردیفِ فهرستِ حساب‌های باز — صندوق و گزارش. */
export interface OpenAccountSummary {
  id: string;
  number: number;
  customerId: string;
  customerName: string;
  phone: string | null;
  status: "OPEN" | "SETTLED" | "CANCELLED";
  total: number;
  invoiceCount: number;
  firstVisit: string | null;
  lastVisit: string | null;
  createdAt: string;
}

/** پرونده‌ی کاملِ یک حساب باز — فاکتورهای باز با ردیف‌هایشان. */
export interface OpenAccountDetail {
  id: string;
  number: number;
  customerId: string;
  customerName: string;
  phone: string | null;
  status: "OPEN" | "SETTLED" | "CANCELLED";
  note: string | null;
  settledAt: string | null;
  createdAt: string;
  /** آنچه مشتری باید بدهد — پس از مرجوعی و اصلاحیه. */
  total: number;
  /** آنچه برداشته شده بود، پیش از اسنادِ جبرانی. */
  grossTotal: number;
  invoiceCount: number;
  invoices: OpenAccountInvoice[];
}

/** یک قلم روی برگه‌ی تجمیعیِ حساب. */
export interface OpenAccountSheetLine {
  id: string;
  productName: string;
  sku: string | null;
  unit: string | null;
  quantity: number;
  returnedQuantity: number;
  correctedQuantity: number;
  effectiveQuantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

/**
 * برگه‌ی تجمیعیِ کلِ حساب باز — «فاکتور کلی»ی که مشتری سرِ تسویه می‌برد.
 * برخلافِ پرونده، نوبت‌های تسویه‌شده را هم دارد.
 */
export interface OpenAccountSheet {
  id: string;
  number: number;
  status: "OPEN" | "SETTLED" | "CANCELLED";
  note: string | null;
  settledAt: string | null;
  createdAt: string;
  customerName: string;
  phone: string | null;
  visits: {
    id: string;
    number: number;
    createdAt: string;
    discount: number;
    note: string | null;
    gross: number;
    net: number;
    lines: OpenAccountSheetLine[];
  }[];
  returns: {
    id: string;
    number: number;
    createdAt: string;
    refundAmount: number;
    reason: string;
    lines: {
      id: string;
      productName: string;
      unit: string | null;
      quantity: number;
      unitRefund: number;
      lineRefund: number;
    }[];
  }[];
  corrections: {
    id: string;
    number: number;
    createdAt: string;
    amountAdjust: number;
    reason: string;
  }[];
  payments: {
    receiptNumber: number;
    createdAt: string;
    method: PaymentMethod;
    amount: number;
    cheque: { number: string; bankName: string | null; dueDate: string } | null;
  }[];
  totals: {
    gross: number;
    returns: number;
    corrections: number;
    net: number;
    paid: number;
    remaining: number;
  };
}

// =====================================================
// صورت‌حساب کاملِ مشتری — همه‌ی کالاها و همه‌ی پرداخت‌ها
// =====================================================

/** یک قلمِ خرید روی صورت‌حساب. */
export interface FullStatementLine {
  id: string;
  productName: string;
  sku: string | null;
  unit: string | null;
  /** آنچه آن روز برداشت — دست‌نخورده. */
  quantity: number;
  returnedQuantity: number;
  correctedQuantity: number;
  effectiveQuantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  discount: number;
  lineTotal: number;
}

/** یک سطر پرداخت (سرِ خرید یا در رسید). */
export interface FullStatementPaymentRow {
  id: string;
  method: PaymentMethod;
  amount: number;
  cheque: {
    number: string;
    bankName: string | null;
    dueDate: string;
    status: string;
  } | null;
}

export interface FullStatementPurchase {
  id: string;
  number: number;
  createdAt: string;
  /** OPEN یعنی روی حساب باز و هنوز تسویه‌نشده. */
  status: InvoiceStatus;
  dueDate: string | null;
  discount: number;
  note: string | null;
  total: number;
  netTotal: number;
  dueAmount: number;
  lines: FullStatementLine[];
  /** پولی که همان لحظه‌ی خرید داده. */
  payments: FullStatementPaymentRow[];
  returns: {
    id: string;
    number: number;
    createdAt: string;
    refundMethod: PaymentMethod;
    refundAmount: number;
    reason: string;
    lines: {
      id: string;
      productName: string;
      unit: string | null;
      quantity: number;
      unitRefund: number;
      lineRefund: number;
    }[];
  }[];
  corrections: {
    id: string;
    number: number;
    createdAt: string;
    amountAdjust: number;
    reason: string;
  }[];
}

export interface CustomerFullStatement {
  customer: {
    id: string;
    fullName: string;
    phones: string[];
    address: string | null;
    creditDays: number;
    creditLimit: number;
  };
  range: { startDate: string | null; endDate: string | null };
  purchases: FullStatementPurchase[];
  /** پولی که بعداً بابت بدهی آورده. */
  payments: {
    id: string;
    number: number;
    createdAt: string;
    amount: number;
    note: string | null;
    rows: FullStatementPaymentRow[];
    appliedTo: { invoiceNumber: number | null; amount: number }[];
  }[];
  totals: {
    purchasedGross: number;
    purchasedNet: number;
    returned: number;
    corrections: number;
    paidAtSale: number;
    paidLater: number;
    paidTotal: number;
    openingBalance: number;
    closingBalance: number;
  };
}

export interface Invoice {
  id: string;
  number: number;
  subtotal: number;
  discount: number;
  /** تفاوتِ فروشِ مدت‌دار (سودِ چک) روی این فاکتور. */
  financeCharge?: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  profit?: number | null;
  status: InvoiceStatus;
  note?: string | null;
  cancelReason?: string | null;
  /** فقط در فهرست پر می‌شود: آیا این فاکتور دستِ‌کم یک مرجوعی خورده است. */
  hasReturns?: boolean;
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
     * تخفیف همین ردیف به ریال.
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
  /** سررسید بخش حساب‌باز. null یعنی فاکتور نسیه‌ای نداشته. */
  dueDate?: string | null;
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
// کارِ کارگر (WorkTask) — فقط تابلوی کار و پیشرفت؛ هیچ ربطی به موجودی ندارد
// =====================================================

export type WorkTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type WorkTaskItemStatus = "PENDING" | "DONE";

/** یک قلمِ کارِ کارگر — کالا + قفسه + تعداد + وضعیت تیک. */
export interface WorkTaskItem {
  id: string;
  taskId: string;
  status: WorkTaskItemStatus;
  productId: string;
  locationId?: string | null;
  quantity: number;
  doneById?: string | null;
  doneAt?: string | null;
  product?: { id: string; name: string; sku?: string | null; unit?: string | null } | null;
  location?: { id: string; name: string; code: string; barcode: string; path: string } | null;
  doneBy?: { id: string; fullName: string } | null;
}

/**
 * کارِ کارگر — POS می‌فرستد، کارگر تیک می‌زند، مدیر پیشرفت را زنده می‌بیند.
 * پیشرفت هرگز ذخیره نمی‌شود؛ `doneItems/totalItems` مشتق از آیتم‌هاست.
 */
export interface WorkTask {
  id: string;
  status: WorkTaskStatus;
  warehouseId: string;
  invoiceId?: string | null;
  quotationId?: string | null;
  assignedToId?: string | null;
  note?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
  doneItems: number;
  totalItems: number;
  invoice?: { number: number } | null;
  quotation?: { number: number } | null;
  requestedBy?: { id: string; fullName: string } | null;
  assignedTo?: { id: string; fullName: string } | null;
  /** فقط در جزئیات (GET /work-tasks/:id) می‌آید. */
  items?: WorkTaskItem[];
}

/** یک تیکِ آفلاین که گوشیِ کارگر با sync می‌فرستد. */
export interface WorkTaskSyncMutation {
  clientMutationId: string;
  taskId: string;
  itemId: string;
}

export interface WorkTaskSyncResult {
  clientMutationId: string;
  taskId: string;
  itemId: string;
  status: "OK" | "ALREADY_DONE" | "TASK_CANCELLED" | "TASK_NOT_VISIBLE" | "ITEM_NOT_FOUND";
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
  summary: {
    /** فروشِ ناخالص (پیش از کسرِ مرجوعی). */
    totalAmount: number;
    /** برگشت از فروش در همین بازه. */
    returnsAmount: number;
    returnCount: number;
    /** فروشِ خالص = ناخالص − مرجوعی. */
    netAmount: number;
    invoiceCount: number;
    averageInvoiceAmount: number;
    /** سهمِ تفاوتِ فروشِ مدت‌دار (سودِ چک) از همین فروش. */
    financeCharge: number;
    /** فروشِ خودِ کالا — بدونِ سودِ مدت. */
    goodsAmount: number;
  };
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
    /** فروشِ خودِ کالا — پایه‌ی حاشیه. */
    goodsRevenue: number;
    /** تفاوتِ فروشِ مدت‌دار؛ هزینه‌ی خرید ندارد، پس تماماً سود است. */
    financeCharge: number;
    totalCost: number;
    /** حاشیه‌ی کالا. */
    grossProfit: number;
    /** درصدِ حاشیه روی فروشِ کالا، نه روی کلِ فاکتور. */
    profitMarginPercent: number;
    /** سودِ کل = حاشیه‌ی کالا + سودِ مدت. */
    totalProfit: number;
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

/**
 * گزارش بدهکاران — حالا از همان دفتری می‌آید که صفحه‌ی مشتری از آن می‌خواند،
 * پس دو صفحه هیچ‌وقت دو عدد نشان نمی‌دهند.
 */
export interface DebtorsReport {
  summary: {
    totalDebtors: number;
    totalCreditBalance: number;
    current: number;
    dueToday: number;
    overdue: number;
  };
  debtors: {
    data: {
      customerId: string;
      customerName: string;
      phone: string | null;
      creditBalance: number;
      current: number;
      dueToday: number;
      overdue: number;
      nextDueDate: string | null;
      creditLimit: number;
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
      /** مرجوعیِ فروشِ همین فروشنده در این بازه. */
      returnsAmount: number;
      returnsCount: number;
    }[];
    meta: ReportMeta;
  };
}

/** سهم هر دسته‌ی مشتری از فروش — خروجی GET /reports/sales-by-category. */
export interface SalesByCategoryReport {
  summary: {
    /** فروشِ کلِ تأییدشده در بازه (ریال). */
    totalSales: number;
    /** فروشِ مشتری‌هایی که دسته دارند. */
    categorizedSales: number;
    /** فروشِ مشتری‌های بی‌دسته (سطل «بدون دسته»). */
    uncategorizedSales: number;
    /** تعداد دسته‌هایِ دارای فروش در این بازه. */
    categoryCount: number;
    topCategory: { name: string; amount: number } | null;
  };
  categories: {
    /** null یعنی سطل «بدون دسته». */
    categoryId: string | null;
    categoryName: string;
    color: string;
    totalAmount: number;
    totalProfit: number;
    invoiceCount: number;
    /** سهم از کل فروش بازه — جمع روی ۱۰۰ می‌شود. */
    sharePercent: number;
    averageInvoiceAmount: number;
  }[];
}

// =====================================================
// دریافت وجه، پیش‌فاکتور، بک‌آپ
// =====================================================

export interface ReceiptAllocation {
  id: string;
  amount: number;
  invoice: { id: string; number: number; total: number };
}

/** یک سطر پرداختِ رسید — تسویه‌ی ترکیبی (نقد+کارت+چک) در یک رسید. */
export interface ReceiptPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  note?: string | null;
  cheque?: {
    number: string;
    bankName?: string | null;
    dueDate: string;
    status: string;
  } | null;
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
  payments?: ReceiptPayment[];
  allocations?: ReceiptAllocation[];
}

// =====================================================
// برگشت از فروش (مرجوعی)
// =====================================================

/** یک ردیفِ قابل‌برگشت از یک فاکتور — خوراکِ صفحه‌ی مرجوعی. */
export interface ReturnableLine {
  saleLogId: string;
  product: { id: string; name: string; sku?: string | null; unit?: string | null };
  location: { id: string; name: string; code: string; path: string };
  unitPrice: number;
  lineDiscount: number;
  sold: number;
  alreadyReturned: number;
  returnable: number;
  /** قیمتِ مؤثرِ هر واحد پس از سهمِ تخفیفِ فاکتور — پایه‌ی مبلغِ برگشت. */
  effectiveUnitPrice: number;
}

export interface ReturnableInvoice {
  invoice: {
    id: string;
    number: number;
    status: InvoiceStatus;
    total: number;
    dueAmount: number;
    customer: { id: string; firstName: string; lastName?: string | null; fullName: string } | null;
  };
  lines: ReturnableLine[];
  /** فاکتورِ باطل‌شده قابلِ مرجوعی نیست؛ نهایی و حساب‌باز هستند. */
  returnable: boolean;
  /** روی حساب باز پولی پرداخت نشده — برگشت فقط «کسر از حساب». */
  isOpenAccount: boolean;
  accountId: string | null;
}

export interface CreateReturnDto {
  idempotencyKey?: string;
  invoiceId: string;
  /** CASH/CARD وجه از صندوق؛ CREDIT کاهشِ بدهی/بستانکاری در دفتر. */
  refundMethod: PaymentMethod;
  reason: string;
  note?: string;
  lines: { saleLogId: string; quantity: number; restock?: boolean }[];
}

export interface SaleReturn {
  id: string;
  number: number;
  invoiceId: string;
  refundMethod: PaymentMethod;
  refundAmount: number;
  reason: string;
  note?: string | null;
  createdAt: string;
  invoice?: { id: string; number: number } | null;
  customer?: (Customer & { fullName?: string }) | null;
  warehouse?: { id: string; name: string; code: string } | null;
  user?: { id: string; fullName: string; username?: string } | null;
  lines?: {
    id: string;
    quantity: number;
    unitRefund: number;
    lineRefund: number;
    restock: boolean;
    product: { id: string; name: string; sku?: string | null; unit?: string | null };
    location: { id: string; name: string; code: string; path: string };
  }[];
  _count?: { lines: number };
}

export interface SaleReturnListRow {
  id: string;
  number: number;
  refundMethod: PaymentMethod;
  refundAmount: number;
  reason: string;
  createdAt: string;
  invoice?: { id: string; number: number } | null;
  customer?: { id: string; firstName: string; lastName?: string | null; fullName: string } | null;
  user?: { id: string; fullName: string } | null;
  _count?: { lines: number };
}

// ----- اصلاحیه فاکتور -----

export interface CorrectableLine {
  saleLogId: string;
  product: { id: string; name: string; sku?: string | null; unit?: string | null };
  location: { id: string; name: string; code: string; path: string };
  /** تعدادِ فعلی (فروش + اثر اصلاحیه‌های قبلی). */
  oldQuantity: number;
  /** قیمتِ واحدِ فعلی (آخرین تصحیح‌شده). */
  oldUnitPrice: number;
  sold: number;
  correctedBy: number;
}

export interface CorrectableInvoice {
  invoice: {
    id: string;
    number: number;
    status: InvoiceStatus;
    total: number;
    dueAmount: number;
    accountId?: string | null;
    customer: { id: string; firstName: string; lastName?: string | null; fullName: string } | null;
  };
  lines: CorrectableLine[];
  /** نهایی و حساب‌باز اصلاحیه می‌خورند؛ باطل‌شده نه. */
  correctable: boolean;
  isOpenAccount: boolean;
}

export interface CreateCorrectionDto {
  idempotencyKey?: string;
  invoiceId: string;
  /** دلیلِ اصلاحیه — اجباری. */
  reason: string;
  note?: string;
  lines: { saleLogId: string; newQuantity: number; newUnitPrice: number }[];
}

export interface SaleCorrectionLine {
  id: string;
  correctionId: string;
  saleLogId: string;
  oldQuantity: number;
  newQuantity: number;
  oldUnitPrice: number;
  newUnitPrice: number;
  lineAdjust: number;
  product: { id: string; name: string; sku?: string | null; unit?: string | null };
  location: { id: string; name: string; code: string; path: string };
}

export interface SaleCorrection {
  id: string;
  number: number;
  invoiceId: string;
  amountAdjust: number;
  reason: string;
  note?: string | null;
  createdAt: string;
  invoice?: { id: string; number: number } | null;
  customer?: (Customer & { fullName?: string }) | null;
  warehouse?: { id: string; name: string; code: string } | null;
  user?: { id: string; fullName: string; username?: string } | null;
  lines?: SaleCorrectionLine[];
  _count?: { lines: number };
}

export interface SaleCorrectionListRow {
  id: string;
  number: number;
  amountAdjust: number;
  reason: string;
  createdAt: string;
  invoice?: { id: string; number: number } | null;
  customer?: { id: string; firstName: string; lastName?: string | null; fullName: string } | null;
  user?: { id: string; fullName: string } | null;
  _count?: { lines: number };
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
  customerId?: string | null;
  note?: string | null;
  convertedInvoiceId?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
  _count?: { lines: number };
  lines?: {
    id: string;
    /** مکان اختیاری است — هنگام قیمت‌دادن هنوز لزومی ندارد قفسه مشخص باشد. */
    locationId?: string | null;
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

/** یک فایل بک‌آپ روی سرور — خوراکِ جدولِ بازیابی. */
export interface BackupFile {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  /** آرشیوی که خوانده نشود بازیابی هم نمی‌شود. */
  verified: boolean;
}

export interface BackupFilesResponse {
  directory: string;
  files: BackupFile[];
}

export interface RestoreResult {
  success: true;
  sourceFile: string;
  /** بک‌آپی که خودکار پیش از بازیابی گرفته شد — راهِ برگشت. */
  preRestoreFile: string | null;
  counts: { products: number; users: number };
  /**
   * بک‌آپ از نسخه‌ی قدیمی‌تری بوده و این مایگریشن‌ها روی دیتابیس نیستند.
   * خالی یعنی همه‌چیز هم‌نسخه است.
   */
  pendingMigrations: string[];
  message: string;
}

export interface RestoreRun {
  id: string;
  sourceFile: string;
  preRestoreFile: string | null;
  status: "RUNNING" | "SUCCESS" | "FAILED";
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

/** یک ردیف تاریخچه‌ی قیمت. قیمت‌ها ریال و عدد صحیح‌اند. */
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

// =====================================================
// فاکتور خرید — ورودِ کالا از برگه‌ی فروشنده
// =====================================================

export interface PurchaseLineInput {
  productId: string;
  /** نفرستادنش یعنی «قفسه را نمی‌دانم» — سرور روی «انبار موقت» می‌گذارد. */
  locationId?: string;
  quantity: number;
  /** قیمت خرید هر واحد به ریال. همین است که گزارش سود را ممکن می‌کند. */
  unitPrice: number;
  discount?: number;
}

export interface CreatePurchaseInput {
  idempotencyKey: string;
  warehouseId: string;
  supplierId?: string | null;
  /** شماره‌ی فاکتور روی برگه‌ی فروشنده. */
  supplierRef?: string;
  /** تاریخ روی برگه (ISO) — تبدیل شمسی سمت کلاینت. */
  invoiceDate?: string;
  discount?: number;
  note?: string;
  lines: PurchaseLineInput[];
}

export interface PurchaseLine {
  id: string;
  productId: string;
  locationId: string;
  quantity: number;
  unitPrice: number | null;
  product?: { id: string; name: string; sku: string; unit?: string | null };
  location?: { id: string; name: string; code: string; path?: string | null };
}

export interface Purchase {
  id: string;
  number: number;
  supplierId: string | null;
  warehouseId: string;
  supplierRef: string | null;
  invoiceDate: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: "CONFIRMED" | "CANCELLED";
  note: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  supplier?: { id: string; name: string; phone?: string | null } | null;
  user?: { id: string; fullName: string | null } | null;
  lines?: PurchaseLine[];
  _count?: { lines: number };
}

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "ثبت شده",
  CANCELLED: "باطل شده",
};
