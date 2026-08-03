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
