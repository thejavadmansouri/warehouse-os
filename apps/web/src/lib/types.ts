// تمام تایپ‌های پروژه — منبع: سند مشخصات API (بخش‌های ۴ تا ۶.۱۲)
// هر تایپ با کامنت بخش مربوطه نشانه‌گذاری شده.

// طبق بخش ۴
export type Role = "ADMIN" | "MANAGER" | "STAFF" | "SALES";

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  /** دسترسی به بخش «فروشگاه اینترنتی» — مستقل از نقش. */
  canManageSite?: boolean;
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
  canManageSite?: boolean;
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
  /** قیمتِ چهارم — عددِ آزادِ مدیر. */
  managerPrice?: number | null;
  minStock?: number | null;
  isActive?: boolean;
  image?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** روی فروشگاه اینترنتی دیده می‌شود — مستقل از isActive. */
  showOnline?: boolean;
  /** قیمت پیش از تخفیف. */
  compareAtPrice?: number | null;
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
  /** همه‌ی بارکدهای این کالا — داخلی، کارخانه، و هر بارکدی که وصل شده. */
  barcodes?: ProductBarcodeRow[];
}

/** یک بارکد که به کالا وصل است. */
export interface ProductBarcodeRow {
  id: string;
  barcode: string;
  type: "INTERNAL" | "FACTORY" | "QR" | "OTHER";
  createdAt?: string;
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
  /** قیمتِ چهارم — عددِ آزادِ مدیر. */
  managerPrice?: number;
  /** قیمت پیش از تخفیف — روی سایت خط‌خورده نشان داده می‌شود. */
  compareAtPrice?: number;
  minStock?: number;
  isActive?: boolean;
  image?: string;
  /** روی فروشگاه اینترنتی دیده شود. */
  showOnline?: boolean;
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
  "IN" | "OUT" | "TRANSFER" | "ADJUST" | "SALE" | "RETURN" | "COUNT";

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
export interface KardexAsset {
  assetId: string;
  /** مسیر ذخیره‌شده (مثل /storage/inventory-photos/...) — برای fetch با توکن نیست. */
  url: string;
  thumbUrl?: string | null;
  mimeType?: string | null;
}

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
  /** عکس‌هایی که موقعِ همین حرکت با گوشی گرفته شده‌اند (INVENTORY_IMAGE). */
  assets?: KardexAsset[];
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
  /** دسترسی به فروشگاه اینترنتی — مستقل از نقش. */
  canManageSite?: boolean;
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
  phone?: string | null;
  address?: string | null;
  createdAt?: string;
}

export interface CreateSupplierInput {
  name: string;
  phone?: string;
  address?: string;
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
  salePrice?: number | null;
  /** فقط برای مدیر می‌آید — بهای خرید و قیمتِ پیشنهادیِ ۱۵٪ و قیمتِ مدیر (فروشنده نمی‌بیند). */
  purchasePrice?: number | null;
  suggestedPrice?: number | null;
  managerPrice?: number | null;
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
  /** فقط برای مدیر — بهای خرید و قیمتِ پیشنهادیِ ۱۵٪ و قیمتِ مدیر (فروشنده نمی‌بیند). */
  purchasePrice?: number | null;
  suggestedPrice?: number | null;
  managerPrice?: number | null;
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
    minStock?: number;
  };
  stock: StockLocation[];
  /** جمعِ موجودیِ همه‌ی قفسه‌ها. */
  onHand?: number;
  /** به کسِ دیگری قول داده شده: کار برداشت، پیش‌فاکتور، یا سفارش سایت. */
  reserved?: number;
  /** `onHand − reserved`. می‌تواند منفی باشد و همان هم معنادار است. */
  available?: number;
  /** موجودیِ قابل‌فروش به حد سفارش رسیده یا پایین‌تر است. */
  belowMinStock?: boolean;
}

/** تفکیکِ رزرو — «چرا این تعداد قول داده شده». */
export interface ReservationBreakdown {
  pickTasks: {
    taskId: string;
    quantity: number;
    invoiceNumber: number | null;
    assignedTo: string | null;
    createdAt: string;
  }[];
  quotations: {
    quotationId: string;
    number: number;
    quantity: number;
    validUntil: string;
    customer: string | null;
  }[];
  onlineOrders: { orderId: string; number: number; quantity: number }[];
}

export interface CustomerPhone {
  /** از روی خودِ شماره تعیین می‌شود — تنها MOBILE پیامک می‌گیرد. */
  kind?: "MOBILE" | "LANDLINE" | "OTHER";
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
  /** معوقِ خالص — بعد از کسرِ اعتبارِ حساب از فاکتورهای گذشته‌سررسید. */
  overdue: number;
  /**
   * اعتبارِ آزادِ حساب — مرجوعیِ «کسر از حساب» و پیش‌پرداخت‌هایی که روی هیچ
   * فاکتوری ننشسته. جمعِ سطل‌ها + این عدد = مانده‌ی واقعی.
   */
  accountCredit: number;
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
  | "ADJUSTMENT"
  | "PAYOUT"
  | "PAYMENT_REVERSED"
  | "RECOMPOSE";

/**
 * یک رویدادِ «سرگذشت فاکتور» — فاکتور، مرجوعی، اصلاحیه، دریافت و…
 *
 * همه‌چیز از دفتر می‌آید؛ همان چیزی که ماندهٔ مشتری هم از آن ساخته می‌شود.
 */
export interface InvoiceStoryEvent {
  id: string;
  kind: LedgerEntryType;
  /** مثبت = بدهی زیاد شده، منفی = کم شده. */
  amount: number;
  at: string;
  /** شمارهٔ سندِ پشتِ این رویداد (رسید/مرجوعی/اصلاحیه/پرداخت). */
  docNumber?: number | null;
  method?: string | null;
  note?: string | null;
}

/** پرداختی که بابتِ همین فاکتور گرفته شده (تخصیصِ یک رسید به این فاکتور). */
export interface InvoiceStoryPayment {
  id: string;
  amount: number;
  at: string;
  receiptNumber: number;
  methods: PaymentMethod[];
}

/** پولِ نقد/کارتیِ سرِ فروش — روی حساب مشتری ننشسته. */
export interface InvoiceStorySalePayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  at: string;
}

/** پاسخِ «سرگذشت این فاکتور» — خوراکِ نوارِ پایینِ فهرستِ فاکتورها. */
export interface InvoiceStory {
  invoice: {
    id: string;
    number: number;
    status: InvoiceStatus;
    createdAt: string;
    customerId?: string | null;
    dueAmount: number;
  };
  events: InvoiceStoryEvent[];
  /** پرداخت‌های روی همین فاکتور، با شمارهٔ رسید و تاریخ. */
  payments: InvoiceStoryPayment[];
  /** پولِ نقد/کارتیِ سرِ فروش. */
  salePayments: InvoiceStorySalePayment[];
  /** مرجوعی‌های نقد/کارت که دفتر ندیده‌اند؛ روی مانده اثری ندارند. */
  offAccountRefunds: {
    id: string;
    number: number;
    amount: number;
    method: PaymentMethod;
    at: string;
  }[];
  /** ماندهٔ فعلیِ همین فاکتور — همان عددِ ستون «مانده». */
  due: number;
}

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  /** مثبت = بدهی زیاد شده، منفی = کم شده. */
  amount: number;
  note?: string | null;
  createdAt: string;
  invoice?: { id: string; number: number } | null;
  receipt?: { id: string; number: number } | null;
  /** سندِ پرداخت به مشتری — فقط برای ردیف‌های PAYOUT. */
  payout?: { id: string; number: number } | null;
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
  /**
   * معنیِ عددهای پولِ داخل دیتابیس. یک واقعیت است، نه ترجیح نمایشی —
   * عوض‌کردنش هیچ ردیفی را بازنویسی نمی‌کند ولی معنیِ همه را عوض می‌کند.
   */
  storedUnit: CurrencyUnit;
  /** واحدِ نمایش در پنل و صندوق. */
  panelUnit: CurrencyUnit;
  /** واحدِ نمایش در سایت عمومی. */
  siteUnit: CurrencyUnit;
}

/** واحد پول. رابطه ثابت است: ۱ تومان = ۱۰ ریال. */
export type CurrencyUnit = "RIAL" | "TOMAN";

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
  /** مجموع اعتبار حساب‌ها در سراسر بدهکاران. */
  accountCredit: number;
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
  /** توضیحِ همین قلم — روی برگه‌ی فاکتور زیرِ نامِ کالا چاپ می‌شود. */
  lineNote?: string;
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

/**
 * مشتری با مانده‌ی غیرصفر — بدهکار یا طلبکار.
 *
 * خوراکِ «حساب باز» صندوق و فیلترِ «حساب‌بازها» در پنل مشتری: مانده از خودِ
 * دفتر می‌آید، پس نسیه‌های معمولی هم که «حسابِ کلی» ندارند اینجا دیده می‌شوند.
 */
export interface CustomerBalanceRow {
  id: string;
  fullName: string;
  phone: string | null;
  creditLimit?: number | null;
  creditDays?: number | null;
  /** مثبت = بدهکار (به ما بدهکار است)، منفی = طلبکار (ما به او بدهکاریم). */
  balance: number;
  kind: "debtor" | "creditor";
  /** تفکیک سنی — فقط برای بدهکار معنا دارد؛ بعد از کسرِ اعتبارِ حساب. */
  current: number;
  dueToday: number;
  overdue: number;
  /** اعتبارِ حساب — بستانکاری که روی فاکتور ننشسته (مرجوعی/پیش‌پرداخت). */
  accountCredit?: number;
  /** نزدیک‌ترین سررسیدِ باز (بدهکارها). */
  nextDueDate: string | null;
  /** مانده‌ی سقف اعتبار — سقفِ تعیین‌نشده null است. */
  available?: number | null;
  /** تعداد فاکتورهای مانده‌دار — همان «۲ نوبت» که صندوق نشان می‌دهد. */
  invoiceCount: number;
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
    cheque?: {
      number: string;
      bankName?: string | null;
      dueDate: string;
    } | null;
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
    /** توضیحِ دستیِ فروشنده روی همین قلم — زیرِ نامِ کالا چاپ می‌شود. */
    lineNote?: string | null;
    product: {
      id: string;
      name: string;
      sku?: string | null;
      unit?: string | null;
    };
    location: { id: string; name: string; code: string; path: string };
    /*
     * وضعیتِ «الان»ِ قلم — خوراکِ برگه‌ی چاپ. سرور برای برگه‌ی نهایی می‌فرستد:
     * تعدادِ خالص، آخرین قیمتِ تصحیح‌شده، سهمِ تخفیفِ باقی‌مانده و قیمتِ مؤثرِ
     * هر واحد. ردیفی که کاملاً برگشته با مانده‌ی صفر می‌آید و برگه آن را
     * چاپ نمی‌کند — سابقه در سیستم کامل می‌ماند، روی کاغذ نمی‌آید.
     */
    netQuantity?: number;
    currentUnitPrice?: number;
    netLineDiscount?: number;
    effectiveUnitPrice?: number;
  }[];
  /** جمعِ وجهِ برگشتیِ همه‌ی مرجوعی‌های این فاکتور. */
  refundTotal?: number;
}

/** برگشت از یک فاکتورِ قبلی، داخلِ سبدِ خالص (تعویض). */
export interface NetReturnGroupDto {
  /** فاکتورِ قبلیِ همین مشتری که کالا از آن برمی‌گردد. */
  invoiceId: string;
  lines: { saleLogId: string; quantity: number; restock?: boolean }[];
}

/**
 * سبدِ خالص — «جنسِ قبلی پس داده می‌شود + جنسِ نو برده می‌شود» در یک
 * درخواستِ اتمیک. سرور همه را در یک تراکنش ثبت می‌کند: فاکتورِ فروشِ نو +
 * سند(های) مرجوعیِ ردیف‌هایِ برگشتی — یا همه یا هیچ‌کدام.
 */
export interface CreateNetSaleDto {
  idempotencyKey: string;
  warehouseId: string;
  /** اجباری: برگشت فقط برای فاکتورهایِ قبلیِ همین مشتری معنا دارد. */
  customerId: string;
  /** وجهِ برگشتی — در این نسخه فقط نقد/کارت. */
  refundMethod: PaymentMethod;
  /** دلیلِ مرجوعی — اجباری، روی هر سندِ مرجوعی می‌نشیند. */
  reason: string;
  note?: string;
  dueDate?: string;
  discount?: number;
  /** مرجوعی از چند فاکتورِ قبلیِ همین مشتری. */
  returns: NetReturnGroupDto[];
  /** ردیف‌هایِ فروشِ نو. */
  lines: InvoiceLineInput[];
  payments?: PaymentInput[];
}

/** پاسخِ یک سبدِ خالصِ ثبت‌شده — فاکتورِ نو + مرجوعی‌هایِ همراهش. */
export interface NetSaleResult {
  invoice: Invoice;
  returns: SaleReturn[];
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
  product: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
  };
  location: {
    id: string;
    name: string;
    code: string;
    barcode: string;
    path: string;
  };
  requestedBy?: { id: string; fullName: string } | null;
  pickedBy?: { id: string; fullName: string } | null;
}

// =====================================================
// کارِ کارگر (WorkTask) — فقط تابلوی کار و پیشرفت؛ هیچ ربطی به موجودی ندارد
// =====================================================

export type WorkTaskStatus =
  "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
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
  product?: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
  } | null;
  location?: {
    id: string;
    name: string;
    code: string;
    barcode: string;
    path: string;
  } | null;
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
  status:
    | "OK"
    | "ALREADY_DONE"
    | "TASK_CANCELLED"
    | "TASK_NOT_VISIBLE"
    | "ITEM_NOT_FOUND";
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
    /** مجموع اعتبار حساب‌ها (مرجوعی/پیش‌پرداختِ روی فاکتور ننشسته). */
    accountCredit?: number;
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

/**
 * یک چک در پرونده‌ی مشتری — با مسیرِ مالیش: چک یا با فاکتور گرفته شده (SALE)
 * یا بابتِ تسویه‌ی بدهی آمده (RECEIPT). مبلغ از مسیر می‌آید، نه از خودِ چک.
 */
export interface CustomerChequeRow {
  id: string;
  number: string;
  bankName: string | null;
  dueDate: string;
  status: "IN_HAND" | "DEPOSITED" | "CASHED" | "BOUNCED";
  settledAt: string | null;
  amount: number;
  source: "SALE" | "RECEIPT";
  docNumber: number | null;
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

/** یک قالب پیامک. متنش را مدیر می‌تواند عوض کند. */
export interface SmsTemplate {
  id: string;
  /** کلیدِ قرارداد — کد با آن ارجاع می‌دهد و هرگز قابل تغییر نیست. */
  key: string;
  title: string;
  body: string;
  isActive: boolean;
  /** متغیرهای مجازِ همین قالب — از تعریف قالب در بک‌اند می‌آید، نه از دیتابیس. */
  vars?: string[];
  /** متنِ پیش‌فرضِ تعریف قالب — برای دکمه‌ی «بازنشانی به متن اصلی». */
  defaultBody?: string;
}

/** متنِ نهایی پیش از ارسال — همان چیزی که مشتری می‌بیند. */
export interface SmsPreview {
  body: string;
  /** شماره‌ی موبایلی که پیامک به آن می‌رود. null یعنی مشتری موبایل ندارد. */
  phone: string | null;
  templateTitle: string;
  isActive: boolean;
  optedOut: boolean;
  /** متغیرهایی که مقدار نگرفتند و در متن خام مانده‌اند. */
  missingVars: string[];
}

export interface SmsMessage {
  id: string;
  customerId: string | null;
  phone: string;
  body: string;
  status: "QUEUED" | "SENT" | "FAILED" | "CANCELLED";
  provider: string | null;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  template?: { key: string; title: string } | null;
}

/** کسری محصول — تقاضایی که جواب نگرفت. سیگنالِ خرید، نه اصلاحِ موجودی. */
export interface ProductShortage {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  customerId: string | null;
  warehouseId: string;
  userId: string | null;
  note: string | null;
  status: "OPEN" | "ORDERED" | "DISMISSED";
  resolvedAt: string | null;
  createdAt: string;
  product?: { id: string; name: string; sku: string } | null;
  customer?: { id: string; firstName: string; lastName: string | null } | null;
  user?: { id: string; fullName: string | null; username: string } | null;
  /** چند بارِ باز برای همین کالا ثبت شده — عددی که تصمیمِ خرید را می‌سازد. */
  timesRequested: number;
}

export interface CreateShortageInput {
  productId?: string;
  productName: string;
  quantity?: number;
  customerId?: string;
  warehouseId: string;
  note?: string;
}

/** کالاهایی که قیمتِ خریدشان از قیمتِ فروششان بیشتر است — نشانه‌ی تومان/ریال. */
export interface SuspiciousPricesReport {
  summary: { totalSuspicious: number };
  items: {
    data: {
      productId: string;
      productName: string;
      sku: string;
      purchasePrice: number;
      salePrice: number;
      /** خرید تقسیم بر فروش. حدودِ ۱۰ یعنی اشتباهِ واحد پول. */
      ratio: number;
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
// پرداخت به مشتری بستانکار (تسویه بستانکاری)
// =====================================================

/**
 * قرینه‌ی Receipt با جهتِ معکوس: فروشگاه پول می‌دهد.
 *
 * اعتبارِ مشتری (از مرجوعی/اصلاحیه/اصلاحِ دستی) جدا از «پرداختِ واقعی» است؛
 * این سند آن اعتبار را مصرف می‌کند — همان تفکیکِ Credit Note و Refund
 * Payment در QuickBooks/Odoo. چکِ پرداختی سود/نرخ ندارد؛ مبلغِ روی کاغذِ چک
 * همان مبلغِ سند است.
 */
export interface CustomerPayout {
  id: string;
  number: number;
  amount: number;
  method: Exclude<PaymentMethod, "CREDIT">;
  /** دلیلِ اجباری — قابلِ دفاع برای بعد. */
  reason: string;
  note?: string | null;
  chequeNumber?: string | null;
  bankName?: string | null;
  chequeDueDate?: string | null;
  createdAt: string;
  customerName: string;
  customer?: { id: string; firstName: string; lastName?: string | null };
  user?: { fullName: string } | null;
}

// =====================================================
// برگشت از فروش (مرجوعی)
// =====================================================

/** یک ردیفِ قابل‌برگشت از یک فاکتور — خوراکِ صفحه‌ی مرجوعی. */
export interface ReturnableLine {
  saleLogId: string;
  product: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
  };
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
    customer: {
      id: string;
      firstName: string;
      lastName?: string | null;
      fullName: string;
    } | null;
  };
  lines: ReturnableLine[];
  /** فاکتورِ باطل‌شده قابلِ مرجوعی نیست؛ نهایی و حساب‌باز هستند. */
  returnable: boolean;
  /** روی حساب باز پولی پرداخت نشده — برگشت فقط «کسر از حساب». */
  isOpenAccount: boolean;
  /** مانده‌ی کلِ مشتری — مثبت یعنی بدهکار؛ پایه‌ی پیش‌فرضِ روشِ برگشت. */
  customerBalance: number;
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
    product: {
      id: string;
      name: string;
      sku?: string | null;
      unit?: string | null;
    };
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
  /** وقتی این مرجوعی نیمی از «عملیات یکپارچه» (adjust) است، کلیدِ گروه‌بندیِ مشترک. */
  operationKey?: string | null;
  invoice?: { id: string; number: number } | null;
  customer?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    fullName: string;
  } | null;
  user?: { id: string; fullName: string } | null;
  _count?: { lines: number };
  /** ریز اقلام — فقط وقتی پرسش با invoiceId فیلتر شده باشد سرور می‌فرستد. */
  lines?: {
    id: string;
    quantity: number;
    unitRefund: number;
    lineRefund: number;
    restock: boolean;
    product: { id: string; name: string };
    location: { id: string; path: string };
  }[];
}

// ----- اصلاحیه فاکتور -----

export interface CorrectableLine {
  saleLogId: string;
  /** توضیحِ فعلیِ همین قلم روی فاکتور. */
  lineNote?: string | null;
  product: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
  };
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
    customer: {
      id: string;
      firstName: string;
      lastName?: string | null;
      fullName: string;
    } | null;
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
  /**
   * روشِ ردوبدلِ پول — فقط برای فاکتورِ بدونِ مشتری. روی خودِ فاکتور
   * به‌عنوان پرداخت ثبت می‌شود (منفی = برگشتِ وجه).
   */
  settlementMethod?: "CASH" | "CARD";
  /** قلم‌هایی که در فاکتور نبودند و با همین اصلاحیه اضافه می‌شوند. */
  addedLines?: {
    productId: string;
    /** خالی = مکان سیستمی، مثل خودِ فروش. */
    locationId?: string;
    quantity: number;
    unitPrice: number;
  }[];
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
  /** این قلم با همین اصلاحیه به فاکتور اضافه شده، تصحیح نشده. */
  isNewLine?: boolean;
  product: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
  };
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
  /** وقتی این اصلاحیه نیمی از «عملیات یکپارچه» (adjust) است، کلیدِ گروه‌بندیِ مشترک. */
  operationKey?: string | null;
  invoice?: { id: string; number: number } | null;
  customer?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    fullName: string;
  } | null;
  user?: { id: string; fullName: string } | null;
  _count?: { lines: number };
}

// =====================================================
// عملیاتِ یکپارچه (adjust) — مرجوعی + افزودن + تصحیح در یک تراکنش
// =====================================================

/** یک ردیفِ قابلِ ویرایش برای حالتِ یکپارچه — تلفیقِ returnable و correctable. */
export interface AdjustableLine {
  saleLogId: string;
  /** توضیحِ فعلیِ همین قلم. */
  lineNote?: string | null;
  product: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
  };
  location: { id: string; name: string; code: string; path: string };
  sold: number;
  alreadyReturned: number;
  correctedBy: number;
  /** مانده‌ی قابل‌برگشت = فروش + اثر اصلاحیه‌ها − مرجوعی‌های قبلی. */
  returnable: number;
  /** همان مانده — «تعداد فعلی» برای تصحیح. */
  oldQuantity: number;
  /** قیمتِ واحدِ فعلی (آخرین تصحیح‌شده). */
  oldUnitPrice: number;
  /** قیمتِ مؤثرِ هر واحد برای برگشت (پس از سهمِ تخفیفِ فاکتور). */
  effectiveUnitPrice: number;
}

export interface AdjustableInvoice {
  invoice: {
    id: string;
    number: number;
    status: InvoiceStatus;
    total: number;
    paidAmount: number;
    dueAmount: number;
    accountId?: string | null;
    customer: {
      id: string;
      firstName: string;
      lastName?: string | null;
      fullName: string;
    } | null;
  };
  lines: AdjustableLine[];
  /** نهایی و حساب باز قابلِ ویرایش‌اند؛ باطل‌شده نه. */
  adjustable: boolean;
  isOpenAccount: boolean;
  /** مانده‌ی واقعیِ کلِ مشتری — پایه‌ی اعدادِ نوارِ پایینِ ویرایش. */
  customerBalance: number;
  /** ماندهٔ دفتریِ همین فاکتور — با مرجوعی/اصلاحیه تازه شده، برخلاف فیلدِ total. */
  invoiceDue: number;
}

export interface CreateAdjustDto {
  idempotencyKey: string;
  reason: string;
  note?: string;
  returns?: { saleLogId: string; quantity: number; restock?: boolean }[];
  changes?: { saleLogId: string; newQuantity: number; newUnitPrice: number }[];
  additions?: {
    productId: string;
    /** خالی = مکان سیستمی، مثل خودِ فروش. */
    locationId?: string;
    quantity: number;
    unitPrice: number;
  }[];
  /** تسویه‌ی اختلاف. برای اختلاف صفر لازم نیست. */
  settlement?: {
    method: "CASH" | "CARD" | "CHEQUE" | "CREDIT";
    amount?: number;
    cheque?: {
      number: string;
      bankName?: string;
      branch?: string;
      holderName?: string;
      dueDate: string;
      rateBp?: number;
      months?: number;
      rateMode?: "FLAT" | "MONTHLY";
      charge?: number;
    };
  };
  /** تعدیلِ دستیِ مدیر روی اختلاف نهایی (ریال) — مثبت بیشتر بگیر، منفی کمتر. */
  manualAdjustment?: number;
}

/**
 * برگشتِ پرداخت — خنثی‌سازیِ یک پرداختِ ثبت‌شده (کارتخوان برگشت زد / بانک رد کرد).
 * فاکتور سرِ جایش می‌ماند؛ مانده‌اش به بدهی برمی‌گردد و دفترِ مشتری بدهکار می‌شود.
 */
export interface ReversePaymentDto {
  idempotencyKey?: string;
  /** ریال — سقفش پرداخت‌شده‌ی فاکتور است؛ سرور رد می‌کند اگر بیشتر باشد. */
  amount: number;
  method: "CASH" | "CARD" | "CHEQUE";
  /** اختیاری — اگر خالی باشد سند همچنان ثبت می‌شود. */
  reason?: string;
}

export interface PaymentReversalRow {
  id: string;
  invoiceId: string;
  method: "CASH" | "CARD" | "CHEQUE";
  amount: number;
  reason: string;
  createdAt: string;
  user?: { username: string } | null;
}

/** وضعیتِ نمایشیِ هر ردیف پس از عملیات. */
export type AdjustLineStatus =
  "ACTIVE" | "PARTIALLY_RETURNED" | "RETURNED" | "ADDED_LATER";

export interface AdjustResultLine {
  saleLogId: string;
  productId: string;
  productName: string;
  unit: string;
  /** برای قلمِ افزوده‌شده صفر است. */
  originalQuantity: number;
  returnedQuantity: number;
  /** برای ردیف‌های اصلی صفر است. */
  addedQuantity: number;
  currentQuantity: number;
  unitPrice: number;
  lineStatus: AdjustLineStatus;
}

/** پاسخِ کاملِ یک عملیاتِ یکپارچه — هم برای ثبتِ تازه هم برای retry با همان کلید. */
export interface AdjustResult {
  operationKey: string;
  returnId: string | null;
  correctionId: string | null;
  invoice: {
    id: string;
    number: number;
    status: InvoiceStatus;
    totalBefore: number;
    totalAfter: number;
    refundAmount: number;
    additionsAmount: number;
    changesAdjust: number;
    difference: number;
    paidAmount: number;
    dueAmount: number;
    customer: { id: string; fullName: string } | null;
  };
  lines: AdjustResultLine[];
  settlement: {
    direction: "COLLECT" | "PAY" | "NONE";
    amount: number;
    method: "CASH" | "CARD" | "CHEQUE" | "CREDIT" | null;
  };
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
    /** نامِ نمایشیِ قابل‌ویرایش — خالی یعنی نامِ خودِ کالا چاپ شود. */
    label?: string | null;
    quantity: number;
    unitPrice: number;
    discount: number;
    product: {
      id: string;
      name: string;
      sku?: string | null;
      unit?: string | null;
    };
  }[];
}

// طبق بخش ۱۱.۵ — پیش‌فاکتور سفید (برگه‌ی قیمت)
export type BlankQuotationStatus =
  "OPEN" | "PRICED" | "CANCELLED" | "CONVERTED";

/**
 * یک قلمِ متنیِ برگه‌ی سفید.
 *
 * `text` جای نامِ کالا می‌نشیند و `product` تا لحظه‌ی وصل‌کردن نال است. `finalPrice`
 * را مدیر می‌گذارد و `suggestedPrice` فقط پیشنهادِ گوشی است — در هیچ جمعی نمی‌آید.
 */
export interface BlankQuotationLine {
  id: string;
  text: string;
  quantity: number;
  suggestedPrice: number | null;
  finalPrice: number | null;
  /** نال یعنی «قیمت نخورده» — قفلِ اولِ تبدیل. */
  pricedAt: string | null;
  product: {
    id: string;
    name: string;
    sku?: string | null;
    unit?: string | null;
  } | null;
  locationId: string | null;
  locationPath: string | null;
  lineTotal: number;
}

export interface BlankQuotation {
  id: string;
  number: number;
  status: BlankQuotationStatus;
  /** «منقضی» وضعیت ذخیره‌شده نیست؛ سرور آن را از تاریخ حساب می‌کند. */
  displayStatus: BlankQuotationStatus | "EXPIRED";
  customerName: string | null;
  /** پرونده‌ی مشتری، اگر مدیر نام را به مشتریِ موجود وصل کرده باشد. */
  customer?: { id: string; fullName: string } | null;
  note: string | null;
  validUntil: string | null;
  convertedInvoiceId: string | null;
  createdAt: string;
  user?: { id: string; fullName: string } | null;
  lineCount: number;
  /** تعداد ردیف‌های قیمت‌نخورده. */
  unpricedCount: number;
  /** تعداد ردیف‌هایی که به کالای واقعی وصل نشده‌اند. */
  unlinkedCount: number;
  total: number;
  lines: BlankQuotationLine[];
}

/** یک کاندیدِ پیشنهادی برای وصل‌کردن قلمِ متنی به کالای واقعی. */
export interface BlankSuggestionCandidate {
  productId: string;
  name: string;
  sku: string | null;
  unit: string | null;
  salePrice: number | null;
  totalStock: number;
  locationId: string | null;
  locationPath: string | null;
}

export interface BlankLineSuggestion {
  lineId: string;
  lineIndex: number;
  text: string;
  status: "LINKED" | "SUGGEST" | "NONE";
  best: BlankSuggestionCandidate | null;
  candidates: BlankSuggestionCandidate[];
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
  footerText: string | null;
  /** عرض فیزیکی رول؛ بزرگ‌تر از widthMm = چند لیبل کنار هم (رول دوستونه). */
  mediaWidthMm: number | null;
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
  /** قیمتِ چهارم — عددِ آزادِ مدیر (چانه‌زنی/مشتری خاص). */
  managerPrice?: number | null;
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
  /** «هشدارهای قیمت را دیدم» — سند فقط با این پرچم پس از هشدار ثبت می‌شود. */
  confirmPriceWarnings?: boolean;
  lines: PurchaseLineInput[];
}

/** یک قیمتِ مشکوک که سرور روی ردیفِ فاکتور خرید تشخیص داده. */
export interface PurchasePriceWarning {
  kind: "TENFOLD_JUMP" | "ABOVE_SALE_PRICE" | "BIG_JUMP" | "BIG_DROP";
  /** اندیس ردیف در آرایه‌ی `lines`ی که فرستاده شده. */
  lineIndex: number;
  productId: string;
  productName: string;
  /** قیمتی که الان وارد شده. */
  current: number;
  /** عددی که با آن مقایسه شده — خرید قبلی یا قیمت فروش. */
  previous: number;
  message: string;
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

export interface PurchaseImportRow {
  row: number;
  sku: string;
  barcode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  product: { id: string; name: string; sku: string } | null;
  status: "READY" | "REVIEW";
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

/** «نمایش در سایت» به‌صورت گروهی — همان شکلِ انتخابِ قیمت‌گذاری گروهی. */
export interface BulkOnlineRequest {
  select: {
    productIds?: string[];
    brandId?: string;
    categoryId?: string;
    search?: string;
    /** فقط کالاهایی که قیمت فروش دارند. */
    onlyWithSalePrice?: boolean;
  };
  showOnline: boolean;
  /** فقط بشمار، ننویس. */
  dryRun?: boolean;
}

export interface BulkOnlineResult {
  affected: number;
  applied: boolean;
}

// =====================================================
// سفارش‌های آنلاین (فروشگاه اینترنتی) — صفِ تحویلِ پنل
// =====================================================

export type OnlineOrderStatus =
  "PLACED" | "PREPARING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export type OnlinePayMethod = "ON_DELIVERY" | "TRANSFER" | "GATEWAY";

/** ردیفِ صف — GET /online-orders. */
export interface OnlineOrderSummary {
  id: string;
  number: number;
  status: OnlineOrderStatus;
  total: number;
  payMethod: OnlinePayMethod;
  receiverName: string;
  receiverPhone: string;
  address: string;
  createdAt: string;
  invoiceId: string | null;
  lineCount: number;
}

/** یک قلم سفارش. */
export interface OnlineOrderLine {
  productId: string;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/** جزئیات — GET /online-orders/:id. */
export interface OnlineOrderDetail {
  id: string;
  number: number;
  status: OnlineOrderStatus;
  subtotal: number;
  shippingFee: number;
  total: number;
  payMethod: OnlinePayMethod;
  receiverName: string;
  receiverPhone: string;
  address: string;
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  invoiceId: string | null;
  warehouseId: string | null;
  customerId: string | null;
  lines: OnlineOrderLine[];
}

/** پاسخِ لغو — جزئیات + فاکتوری که باید دستی باطل شود. */
export interface CancelOnlineOrderResult extends OnlineOrderDetail {
  /** اگر پر باشد، این فاکتورِ داخلی هنوز باز است و باید جدا باطل شود. */
  invoiceToCancel: string | null;
}

// =====================================================
// دفتر روزنامه (Voucher) — سندِ خودکارِ پشتِ هر اکشن مالی
// =====================================================

export type VoucherSourceType =
  | "SALE_INVOICE"
  | "SALE_CANCEL"
  | "RECEIPT"
  | "SALE_RETURN"
  | "SALE_CORRECTION"
  | "PURCHASE_INVOICE"
  | "PURCHASE_CANCEL"
  | "CHEQUE_DEPOSIT"
  | "CHEQUE_BOUNCED"
  | "CHEQUE_CASHED"
  | "CUSTOMER_PAYOUT"
  | "PAYMENT_REVERSAL"
  | "PAYMENT_RECOMPOSE";

/** خطِ یک سند — مثبت = بدهکار، منفی = بستانکار. */
export interface VoucherLineRow {
  account: string;
  /** برچسب فارسیِ حساب — از سرور می‌آید. */
  accountLabel: string;
  amount: number;
  debit: number;
  credit: number;
  customerId: string | null;
  note: string | null;
}

/** ردیفِ دفتر روزنامه — سرصفحه‌ی سند + خطوطش. */
export interface VoucherRow {
  id: string;
  number: number;
  sourceType: VoucherSourceType;
  sourceId: string;
  /** برچسب فارسیِ نوع سند — از سرور می‌آید. */
  sourceLabel: string;
  note: string | null;
  userId: string | null;
  createdAt: string;
  /** پر = این سند معکوسِ سندِ دیگری است (ابطال). */
  reversesVoucherId: string | null;
  /**
   * فاکتوری که این سند به آن برمی‌گردد — برای مرجوعی/اصلاحیه از سندِ خودشان
   * حل شده (sourceId خودِ سندِ مرجوعی است نه فاکتور). برای فروش/ابطال = خودِ
   * فاکتور؛ برای رسید/خرید null می‌ماند.
   */
  invoiceId: string | null;
  lines: VoucherLineRow[];
}

/** پاسخِ GET /vouchers — صفحه‌بندی‌شده. */
export interface VouchersResponse {
  data: VoucherRow[];
  meta: { total: number; page: number; limit: number };
}

/** پاسخِ GET /vouchers/by-invoice/:id — سندهایِ یک فاکتور به ترتیبِ زمان. */
export type InvoiceVouchers = VoucherRow[];

// =====================================================
// اصلاح نحوهٔ پرداخت (تسویهٔ از نو)
// =====================================================

/**
 * یک ردیفِ پرداختِ فاکتور.
 *
 * مبلغ می‌تواند **منفی** باشد: ردیفِ منفی یعنی تقسیمِ اشتباهِ قبلی خنثی شده.
 * تاریخچه حذف نمی‌شود؛ فقط ردیفِ معکوس به آن اضافه می‌شود.
 */
export interface InvoicePaymentRow {
  id: string;
  method: PaymentMethod;
  amount: number;
  note: string | null;
  createdAt: string;
}

/**
 * وضعیتِ تسویهٔ فاکتور — خوراکِ پنلِ «اصلاح نحوهٔ پرداخت».
 *
 * `blockedReason` پیامِ آمادهٔ فارسی است: چرا نمی‌شود اصلاح کرد. پنل همان را
 * نشان می‌دهد، پس کاربر هیچ‌وقت با یک دکمهٔ خاموشِ بی‌توضیح روبه‌رو نمی‌شود.
 */
export interface InvoiceSettlement {
  invoice: {
    id: string;
    number: number;
    status: InvoiceStatus;
    total: number;
    paidAmount: number;
    dueAmount: number;
    dueDate: string | null;
    customerId: string | null;
    customer: {
      id: string;
      firstName: string;
      lastName: string | null;
      fullName: string;
    } | null;
  };
  payments: InvoicePaymentRow[];
  /** جمعِ خالصِ هر روش — نقد/کارت/نسیه. */
  byMethod: { method: PaymentMethod; amount: number }[];
  /** نقدی که واقعاً گرفته شده (نقد + کارت). */
  received: number;
  credit: number;
  canRecompose: boolean;
  blockedReason: string | null;
  /** فاکتور مشتری ندارد؛ برای نسیه‌کردن باید مشتری انتخاب شود. */
  needsCustomer: boolean;
  editableMethods: PaymentMethod[];
}

/** تقسیمِ نهاییِ پرداخت — همان چیزی که پنل می‌فرستد. */
export interface RecomposePaymentsDto {
  idempotencyKey: string;
  reason?: string;
  customerId?: string;
  payments: { method: PaymentMethod; amount: number }[];
}

// =====================================================
