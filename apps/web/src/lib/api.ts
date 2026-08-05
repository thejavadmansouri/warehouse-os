// wrapper مرکزی fetch — طبق بخش ۳، ۴ و ۵ سند
// هیچ‌جای کامپوننت نباید مستقیم fetch صدا بزند؛ همه‌چیز از همین فایل رد می‌شود.
import { useAuthStore } from "./auth-store";
import { ApiException } from "./api-error-messages";
import type { ApiErrorBody } from "./types";
import * as T from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

// ----- کمک‌کننده‌های داخلی -----

// درخواست‌های این کلاینت می‌توانند body را به‌صورت یک آبجکت JSON بدهند؛ این تایپ
// همان قرارداد را در سطح صحیح بیان می‌کند (به‌جای اینکه هر call-site با BodyInit
// درگیر شود). serialize کردن داخل buildInit انجام می‌شود.
export type ApiRequestInit = Omit<RequestInit, "body"> & { body?: unknown };

function isRawBody(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof FormData ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    value instanceof URLSearchParams ||
    value instanceof ReadableStream ||
    ArrayBuffer.isView(value)
  );
}

function buildInit(init: ApiRequestInit): RequestInit {
  const { body, headers, ...rest } = init;
  const finalHeaders: Record<string, string> = {
    ...((headers as Record<string, string>) ?? {}),
  };

  let finalBody: BodyInit | undefined;
  if (body == null) {
    finalBody = undefined;
  } else if (isRawBody(body)) {
    finalBody = body;
  } else if (typeof body === "object") {
    finalBody = JSON.stringify(body);
    if (!finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }
  } else {
    finalBody = String(body);
  }

  return { ...rest, body: finalBody, headers: finalHeaders };
}

async function parseJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function defaultStatusMessage(status: number): string {
  if (status === 401) return "احراز هویت نشده‌اید";
  if (status === 403) return "دسترسی غیرمجاز";
  if (status === 404) return "موردی یافت نشد";
  if (status >= 500) return "خطای سمت سرور";
  return "خطای غیرمنتظره";
}

// fetch پایین‌سطحی — بدون تزریق خودکار توکن، بدون redirect
async function rawFetch<R>(
  path: string,
  init: ApiRequestInit = {}
): Promise<R> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...buildInit(init),
  });

  if (!res.ok) {
    const parsed = (await parseJson(res)) as ApiErrorBody | null;
    if (parsed && typeof parsed.error === "string") {
      throw new ApiException(res.status, parsed);
    }
    throw new ApiException(res.status, {
      error: `HTTP_${res.status}`,
      message: defaultStatusMessage(res.status),
    });
  }

  if (res.status === 204) return undefined as R;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined as R;
  return (await res.json()) as R;
}

// fetch احراز‌شده — توکن را از store می‌خواند و روی ۴۰۱ لاگ‌اوت + ریدایرکت می‌کند
async function apiFetch<R>(path: string, init: ApiRequestInit = {}): Promise<R> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    return await rawFetch<R>(path, { ...init, headers });
  } catch (e) {
    if (e instanceof ApiException && e.status === 401) {
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        useAuthStore.getState().logout();
        /*
         * دلیلِ خروج را با خودمان می‌بریم.
         *
         * هر حساب فقط روی یک دستگاه فعال است، پس بیرون‌افتادنِ ناگهانی معمولاً
         * یعنی همین حساب جای دیگری وارد شده — نه اینکه چیزی خراب شده باشد.
         * بدون این پیام، کاربر فکر می‌کند سیستم قطع شده است.
         */
        const replaced = e.code === "SESSION_REPLACED";
        window.location.href = replaced ? "/login?reason=session" : "/login";
      }
    }
    throw e;
  }
}

// ساخت URL کامل برای عکس محصول — طبق بخش ۳ (سرو فایل‌ها زیر /storage/...)
export function assetUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return `${API_URL}/${path}`;
}

// =====================================================
// ۴. احراز هویت
// =====================================================

// طبق بخش ۴ — POST /auth/login (عمومی)
export async function login(
  username: string,
  password: string
): Promise<T.LoginResponse> {
  try {
    return await rawFetch<T.LoginResponse>("/auth/login", {
      method: "POST",
      body: { username, password },
    });
  } catch (e) {
    if (e instanceof ApiException && e.status === 401) {
      throw new ApiException(401, {
        error: "INVALID_CREDENTIALS",
        message: "نام کاربری یا رمز عبور اشتباه است.",
      });
    }
    throw e;
  }
}

// طبق بخش ۴ — GET /auth/me
export function getMe(): Promise<T.AuthMeResponse> {
  return apiFetch<T.AuthMeResponse>("/auth/me");
}

/**
 * POST /auth/logout — نشستِ سمت سرور را آزاد می‌کند.
 * بدون این، حساب تا ورود بعدی «اشغال» می‌ماند.
 */
export function logoutServer(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
}

// =====================================================
// ۶.۳. محصولات
// =====================================================

// GET /products — سرور پاسخ صفحه‌بندی‌شده { data, meta } می‌دهد؛ آرایه‌ی محصولات را
// استخراج می‌کنیم و در برابر هر دو شکل (آرایه‌ی خام یا wrapped) مقاوم می‌مانیم.
export function getProducts(): Promise<T.Product[]> {
  return apiFetch<T.Product[] | { data?: T.Product[] }>("/products").then((r) =>
    Array.isArray(r) ? r : (r.data ?? [])
  );
}

// GET /products?page=&limit= — نسخه‌ی صفحه‌بندی‌شده با meta (برای مرور کل کاتالوگ)
export function getProductsPaged(
  page = 1,
  limit = 50,
  search?: string,
  brandId?: string
): Promise<{ data: T.Product[]; meta: { total: number; page: number; lastPage: number } }> {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) qs.set("search", search);
  if (brandId) qs.set("brandId", brandId);
  return apiFetch<{ data?: T.Product[]; meta?: { total: number; page: number; lastPage: number } }>(
    `/products?${qs.toString()}`
  ).then((r) => ({
    data: r.data ?? [],
    meta: r.meta ?? { total: (r.data ?? []).length, page, lastPage: 1 },
  }));
}

// طبق بخش ۶.۳ — GET /products/search?q=
// سرور پاسخ صفحه‌بندی‌شده { data, meta } برمی‌گرداند؛ اینجا آرایه‌ی محصولات را
// استخراج می‌کنیم و در برابر هر دو شکل (آرایه‌ی خام یا wrapped) مقاوم می‌مانیم.
export function searchProducts(q: string): Promise<T.Product[]> {
  const qs = new URLSearchParams({ q });
  return apiFetch<T.Product[] | { data?: T.Product[] }>(
    `/products/search?${qs.toString()}`
  ).then((r) => (Array.isArray(r) ? r : (r.data ?? [])));
}

// GET /products/locate?q= — جست‌وجو + خلاصه‌ی موجودی و آدرس قفسه در یک درخواست.
// برای جست‌وجوی زنده‌ی صندوق فروش: هر نتیجه می‌گوید موجود است یا نه و کجا.
export function locateProducts(q: string): Promise<T.LocateResult[]> {
  const qs = new URLSearchParams({ q });
  return apiFetch<T.LocateResult[]>(`/products/locate?${qs.toString()}`);
}

// طبق بخش ۶.۳ — GET /products/:id
export function getProduct(id: string): Promise<T.Product> {
  return apiFetch<T.Product>(`/products/${encodeURIComponent(id)}`);
}

// طبق بخش ۶.۳ — GET /products/barcode/:barcode
export function getProductByBarcode(barcode: string): Promise<T.Product> {
  return apiFetch<T.Product>(
    `/products/barcode/${encodeURIComponent(barcode)}`
  );
}

// طبق بخش ۶.۳ — GET /products/export (دانلود CSV)
// نکته: چون endpoint پشت JwtAuthGuard است، توکن را در header می‌فرستیم و
// سپس فایل را به‌صورت blob دانلود می‌کنیم (نه parse JSON).
export async function exportProductsCsv(): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_URL}/products/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!res.ok) {
    const parsed = (await parseJson(res)) as ApiErrorBody | null;
    throw new ApiException(res.status, parsed ?? {
      error: `HTTP_${res.status}`,
      message: defaultStatusMessage(res.status),
    });
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "products.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// POST /labels/product/print — تولید PDF لیبل محصول (کیفیت بالا، سمت سرور) و
// بازکردنش در تب جدید برای چاپ. items: هر کالا با تعداد کپی. opts: تنظیمات چاپ.
export interface ProductLabelPrintOptions {
  columns?: number;
  widthMm?: number;
  heightMm?: number;
  gapMm?: number;
  showName?: boolean;
  showBarcodeText?: boolean;
  cropMarks?: boolean;
}
export async function printProductLabelsPdf(
  items: { productId: string; quantity: number }[],
  opts: ProductLabelPrintOptions = {}
): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_URL}/labels/product/print`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ items, ...opts }),
  });
  if (!res.ok) {
    const parsed = (await parseJson(res)) as ApiErrorBody | null;
    throw new ApiException(
      res.status,
      parsed ?? { error: `HTTP_${res.status}`, message: defaultStatusMessage(res.status) }
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  // در تب جدید باز شود تا کاربر از نمایشگر PDF چاپ بگیرد (چاپِ ثابت و باکیفیت).
  window.open(url, "_blank");
  // مهلت بده تب باز شود، بعد آزاد کن
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// POST /labels/stock/print — چاپ PDF لیبلِ کل موجودیِ واردشده (هر کالا به تعداد
// مجموع موجودی‌اش) و بازکردن در تب جدید.
export async function printAllStockLabelsPdf(
  opts: ProductLabelPrintOptions = {}
): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${API_URL}/labels/stock/print`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const parsed = (await parseJson(res)) as ApiErrorBody | null;
    throw new ApiException(
      res.status,
      parsed ?? { error: `HTTP_${res.status}`, message: defaultStatusMessage(res.status) }
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// طبق بخش ۶.۳ — POST /products
export function createProduct(dto: T.CreateProductDto): Promise<T.Product> {
  return apiFetch<T.Product>("/products", { method: "POST", body: dto });
}

// طبق بخش ۶.۳ — PATCH /products/:id
export function updateProduct(
  id: string,
  dto: T.UpdateProductDto
): Promise<T.Product> {
  return apiFetch<T.Product>(`/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: dto,
  });
}

// طبق بخش ۶.۳ — DELETE /products/:id
export function deleteProduct(id: string): Promise<void> {
  return apiFetch<void>(`/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// طبق بخش ۶.۳ — POST /uploads/product/:id/image (multipart، فیلد file)
export function uploadProductImage(
  id: string,
  file: File
): Promise<unknown> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<unknown>(
    `/uploads/product/${encodeURIComponent(id)}/image`,
    { method: "POST", body: fd }
  );
}

// =====================================================
// ۶.۴. برندها
// =====================================================

// طبق بخش ۶.۴ — GET /brands
export function getBrands(): Promise<T.Brand[]> {
  return apiFetch<T.Brand[]>("/brands");
}

// POST /products/:id/prices — ثبت قیمت جدید. ردیف تازه در تاریخچه می‌سازد.
// فیلدِ نفرستاده یعنی «عوض نکن»، نه «صفر کن».
export function setProductPrice(
  id: string,
  dto: { purchasePrice?: number; salePrice?: number; wholesalePrice?: number }
): Promise<T.ProductPrice> {
  return apiFetch<T.ProductPrice>(`/products/${encodeURIComponent(id)}/prices`, {
    method: "POST",
    body: dto,
  });
}

/**
 * POST /products/prices/bulk — قیمت‌گذاری دسته‌ای.
 *
 * `dryRun` فقط می‌شمارد چند کالا اثر می‌گیرند و چیزی نمی‌نویسد؛ روی هزاران
 * ردیف، دیدنِ عدد قبل از اجرا تفاوت بین اصلاح و فاجعه است.
 */
export function bulkSetPrice(body: T.BulkPriceRequest): Promise<T.BulkPriceResult> {
  return apiFetch<T.BulkPriceResult>("/products/prices/bulk", {
    method: "POST",
    body,
  });
}

// طبق بخش ۶.۴ — POST /brands (فقط name ذخیره می‌شود)
export function createBrand(name: string): Promise<T.Brand> {
  return apiFetch<T.Brand>("/brands", { method: "POST", body: { name } });
}

// =====================================================
// ۶.۵. مدل‌های خودرو
// =====================================================

// طبق بخش ۶.۵ — GET /vehicle-models
export function getVehicleModels(): Promise<T.VehicleModel[]> {
  return apiFetch<T.VehicleModel[]>("/vehicle-models");
}

// طبق بخش ۶.۵ — POST /vehicle-models
export function createVehicleModel(
  dto: T.CreateVehicleModelDto
): Promise<T.VehicleModel> {
  return apiFetch<T.VehicleModel>("/vehicle-models", {
    method: "POST",
    body: dto,
  });
}

// =====================================================
// ۶.۶. موقعیت‌ها و انواع موقعیت
// =====================================================

// طبق بخش ۶.۶ — GET /locations
export function getLocations(): Promise<T.Location[]> {
  return apiFetch<T.Location[]>("/locations");
}

// طبق بخش ۶.۶ — GET /locations/children?parentId=&warehouseId=
export function getLocationChildren(
  parentId?: string,
  warehouseId?: string
): Promise<T.Location[]> {
  const p = new URLSearchParams();
  if (parentId) p.set("parentId", parentId);
  if (warehouseId) p.set("warehouseId", warehouseId);
  const qs = p.toString();
  return apiFetch<T.Location[]>(`/locations/children${qs ? `?${qs}` : ""}`);
}

// طبق بخش ۶.۶ — GET /locations/:id/path
export function getLocationPath(id: string): Promise<T.Location[]> {
  return apiFetch<T.Location[]>(
    `/locations/${encodeURIComponent(id)}/path`
  );
}

// طبق بخش ۶.۶ — GET /locations/resolve/:barcode
export function resolveLocationByBarcode(
  barcode: string
): Promise<T.Location> {
  return apiFetch<T.Location>(
    `/locations/resolve/${encodeURIComponent(barcode)}`
  );
}

// طبق بخش ۶.۶ — POST /locations
export function createLocation(
  dto: T.CreateLocationDto
): Promise<T.Location> {
  return apiFetch<T.Location>("/locations", { method: "POST", body: dto });
}

// GET /warehouses
export function getWarehouses(): Promise<T.Warehouse[]> {
  return apiFetch<T.Warehouse[]>("/warehouses");
}

// POST /warehouses (ADMIN/MANAGER)
export function createWarehouse(
  dto: T.CreateWarehouseDto
): Promise<T.Warehouse> {
  return apiFetch<T.Warehouse>("/warehouses", { method: "POST", body: dto });
}

// PATCH /warehouses/:id (ADMIN/MANAGER)
export function updateWarehouse(
  id: string,
  dto: T.UpdateWarehouseDto
): Promise<T.Warehouse> {
  return apiFetch<T.Warehouse>(`/warehouses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: dto,
  });
}

// DELETE /warehouses/:id (ADMIN/MANAGER) — انبار دارای موقعیت فقط غیرفعال می‌شود
export function deleteWarehouse(
  id: string
): Promise<T.DeleteWarehouseResult> {
  return apiFetch<T.DeleteWarehouseResult>(
    `/warehouses/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

// GET /locations/:id/subtree-stats — برای دیالوگ تأیید حذف
export function getLocationSubtreeStats(
  id: string
): Promise<T.LocationSubtreeStats> {
  return apiFetch<T.LocationSubtreeStats>(
    `/locations/${encodeURIComponent(id)}/subtree-stats`
  );
}

// DELETE /locations/:id (ADMIN/MANAGER) — حذف هوشمند (خالی→حذف، دارای سابقه→غیرفعال)
export function deleteLocation(id: string): Promise<T.DeleteLocationResult> {
  return apiFetch<T.DeleteLocationResult>(
    `/locations/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

// POST /locations/bulk-delete (ADMIN/MANAGER)
export function bulkDeleteLocations(
  ids: string[]
): Promise<T.BulkDeleteLocationsResult> {
  return apiFetch<T.BulkDeleteLocationsResult>("/locations/bulk-delete", {
    method: "POST",
    body: { ids },
  });
}

// طبق بخش ۶.۶ — GET /location-types?warehouseId=
export function getLocationTypes(
  warehouseId?: string
): Promise<T.LocationType[]> {
  const qs = warehouseId
    ? `?warehouseId=${encodeURIComponent(warehouseId)}`
    : "";
  return apiFetch<T.LocationType[]>(`/location-types${qs}`);
}

// طبق بخش ۶.۶ — POST /location-types
export function createLocationType(
  dto: T.CreateLocationTypeDto
): Promise<T.LocationType> {
  return apiFetch<T.LocationType>("/location-types", {
    method: "POST",
    body: dto,
  });
}

// POST /location-builder/generate — ساخت گروهی درخت موقعیت‌ها
export function generateLocationTree(
  dto: T.GenerateLocationTreeDto
): Promise<T.GenerateLocationTreeResult> {
  return apiFetch<T.GenerateLocationTreeResult>("/location-builder/generate", {
    method: "POST",
    body: dto,
  });
}

// =====================================================
// ۶.۷. موجودی
// =====================================================

// طبق بخش ۶.۷ — GET /inventory/current-stock?page=&limit=
export function getCurrentStock(
  page = 1,
  limit = 50
): Promise<T.CurrentStockResponse> {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return apiFetch<T.CurrentStockResponse>(
    `/inventory/current-stock?${qs.toString()}`
  );
}

// طبق بخش ۶.۷ — GET /inventory/logs (کلید پاسخ items است)
export function getInventoryLogs(
  query: T.InventoryLogsQuery = {}
): Promise<T.InventoryLogsResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") {
      qs.set(k, String(v));
    }
  }
  return apiFetch<T.InventoryLogsResponse>(
    `/inventory/logs?${qs.toString()}`
  );
}

// طبق بخش ۶.۷ — GET /inventory/logs/:id
export function getInventoryLog(id: string): Promise<T.InventoryLogRow> {
  return apiFetch<T.InventoryLogRow>(
    `/inventory/logs/${encodeURIComponent(id)}`
  );
}

// طبق بخش ۶.۷ — GET /inventory/location/:locationId (آرایه خام، بدون wrapper)
export function getInventoryByLocation(
  locationId: string
): Promise<T.InventoryLogRow[]> {
  return apiFetch<T.InventoryLogRow[]>(
    `/inventory/location/${encodeURIComponent(locationId)}`
  );
}

// طبق بخش ۶.۷ — GET /inventory/:productId/:locationId
export function getInventoryRecord(
  productId: string,
  locationId: string
): Promise<T.InventoryRow | null> {
  return apiFetch<T.InventoryRow | null>(
    `/inventory/${encodeURIComponent(productId)}/${encodeURIComponent(locationId)}`
  );
}

// طبق بخش ۶.۷ — POST /inventory (IN)
export function stockIn(dto: T.InventoryOperationDto): Promise<unknown> {
  return apiFetch<unknown>("/inventory", { method: "POST", body: dto });
}

// طبق بخش ۶.۷ — POST /inventory/out (OUT)
export function stockOut(dto: T.InventoryOperationDto): Promise<unknown> {
  return apiFetch<unknown>("/inventory/out", { method: "POST", body: dto });
}

// طبق بخش ۶.۷ — POST /inventory/scan
export function scanProduct(barcode: string): Promise<unknown> {
  return apiFetch<unknown>("/inventory/scan", {
    method: "POST",
    body: { barcode },
  });
}

// طبق بخش ۶.۷ — POST /inventory/scan-out
export function scanOut(dto: T.ScanOutDto): Promise<unknown> {
  return apiFetch<unknown>("/inventory/scan-out", { method: "POST", body: dto });
}

// طبق بخش ۶.۷ — POST /inventory-transfer
export function transferStock(
  dto: T.InventoryTransferDto
): Promise<unknown> {
  return apiFetch<unknown>("/inventory-transfer", { method: "POST", body: dto });
}

// =====================================================
// ۶.۸. ورود صوتی
// =====================================================

// طبق بخش ۶.۸ — POST /inventory-session/start
export function startVoiceSession(
  dto: T.VoiceSessionStartDto = {}
): Promise<T.VoiceSession> {
  return apiFetch<T.VoiceSession>("/inventory-session/start", {
    method: "POST",
    body: dto,
  });
}

// طبق بخش ۶.۸ — POST /inventory/voice
export function submitVoice(dto: T.VoiceInputDto): Promise<T.VoiceResponse> {
  return apiFetch<T.VoiceResponse>("/inventory/voice", {
    method: "POST",
    body: dto,
  });
}

// طبق بخش ۶.۸ — POST /mobile/count/start (مسیر شمارش صوتی با explanation)
export function startCount(
  dto: T.CountStartDto
): Promise<T.CountStartResponse> {
  return apiFetch<T.CountStartResponse>("/mobile/count/start", {
    method: "POST",
    body: dto,
  });
}

// طبق بخش ۶.۸ — POST /mobile/count/:countId/voice
export function countVoice(
  countId: string,
  dto: T.CountVoiceDto
): Promise<T.CountVoiceResponse> {
  return apiFetch<T.CountVoiceResponse>(
    `/mobile/count/${encodeURIComponent(countId)}/voice`,
    { method: "POST", body: dto }
  );
}

// =====================================================
// ۶.۹. انبارگردانی
// =====================================================

// طبق بخش ۶.۹ — POST /inventory-count
export function createInventoryCount(
  dto: T.CreateInventoryCountDto
): Promise<T.InventoryCount> {
  return apiFetch<T.InventoryCount>("/inventory-count", {
    method: "POST",
    body: dto,
  });
}

// طبق بخش ۶.۹ — POST /inventory-count/:id/items
export function addInventoryCountItem(
  id: string,
  dto: T.CreateInventoryCountItemDto
): Promise<unknown> {
  return apiFetch<unknown>(
    `/inventory-count/${encodeURIComponent(id)}/items`,
    { method: "POST", body: dto }
  );
}

// طبق بخش ۶.۹ — GET /inventory-count/:id
export function getInventoryCount(id: string): Promise<T.InventoryCount> {
  return apiFetch<T.InventoryCount>(
    `/inventory-count/${encodeURIComponent(id)}`
  );
}

// طبق بخش ۶.۹ — PATCH /inventory-count/:id/finish
export function finishInventoryCount(id: string): Promise<unknown> {
  return apiFetch<unknown>(
    `/inventory-count/${encodeURIComponent(id)}/finish`,
    { method: "PATCH" }
  );
}

// طبق بخش ۶.۹ — POST /inventory-count/:id/apply
export function applyInventoryCount(id: string): Promise<unknown> {
  return apiFetch<unknown>(
    `/inventory-count/${encodeURIComponent(id)}/apply`,
    { method: "POST" }
  );
}

// =====================================================
// ۶.۱۰. کاربران
// =====================================================

// طبق بخش ۶.۱۰ — GET /users
export function getUsers(): Promise<T.User[]> {
  return apiFetch<T.User[]>("/users");
}

// طبق بخش ۶.۱۰ — POST /users
export function createUser(dto: T.CreateUserDto): Promise<T.User> {
  return apiFetch<T.User>("/users", { method: "POST", body: dto });
}

// طبق بخش ۶.۱۰ — PATCH /users/:id/role
export function updateUserRole(
  id: string,
  dto: T.UpdateRoleDto
): Promise<T.User> {
  return apiFetch<T.User>(`/users/${encodeURIComponent(id)}/role`, {
    method: "PATCH",
    body: dto,
  });
}

// طبق بخش ۶.۱۰ — PATCH /users/:id/password
export function updateUserPassword(
  id: string,
  dto: T.UpdatePasswordDto
): Promise<unknown> {
  return apiFetch<unknown>(`/users/${encodeURIComponent(id)}/password`, {
    method: "PATCH",
    body: dto,
  });
}

// =====================================================
// ۶.۱۲. کاتالوگ قطعات
// =====================================================

// طبق بخش ۶.۱۲ — GET /part-catalog
export function getPartCatalog(): Promise<T.PartCatalog[]> {
  return apiFetch<T.PartCatalog[]>("/part-catalog");
}

// طبق بخش ۶.۱۲ — GET /part-catalog/search?q=
export function searchPartCatalog(q: string): Promise<T.PartCatalog[]> {
  const qs = new URLSearchParams({ q });
  return apiFetch<T.PartCatalog[]>(`/part-catalog/search?${qs.toString()}`);
}

// طبق بخش ۶.۱۲ — POST /part-catalog
export function createPartCatalog(
  dto: T.CreatePartCatalogDto
): Promise<T.PartCatalog> {
  return apiFetch<T.PartCatalog>("/part-catalog", {
    method: "POST",
    body: dto,
  });
}

// طبق بخش ۶.۱۲ — PATCH /part-catalog/:id
export function updatePartCatalog(
  id: string,
  dto: T.CreatePartCatalogDto
): Promise<T.PartCatalog> {
  return apiFetch<T.PartCatalog>(
    `/part-catalog/${encodeURIComponent(id)}`,
    { method: "PATCH", body: dto }
  );
}

// طبق بخش ۶.۱۲ — DELETE /part-catalog/:id
export function deletePartCatalog(id: string): Promise<void> {
  return apiFetch<void>(`/part-catalog/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// =====================================================
// ۶.۱۱. ورود اکسل
// =====================================================

// طبق بخش ۶.۱۱ — POST /imports/upload (multipart، فیلد file)
export function uploadImport(
  file: File
): Promise<T.ImportUploadResponse> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<T.ImportUploadResponse>("/imports/upload", {
    method: "POST",
    body: fd,
  });
}

// طبق بخش ۶.۱۱ — POST /imports/:id/confirm
export function confirmImport(
  id: string,
  dto: T.ImportConfirmDto
): Promise<unknown> {
  return apiFetch<unknown>(
    `/imports/${encodeURIComponent(id)}/confirm`,
    { method: "POST", body: dto }
  );
}

// =====================================================
// افزونه الف: چاپ لیبل (طبق بخش الف سند افزونه)
// =====================================================

// طبق بخش الف — GET /labels/location/:id
export function getLocationLabel(id: string): Promise<T.LocationLabel> {
  return apiFetch<T.LocationLabel>(
    `/labels/location/${encodeURIComponent(id)}`
  );
}

// طبق بخش الف — GET /labels/product/:id
export function getProductLabel(id: string): Promise<T.ProductLabel> {
  return apiFetch<T.ProductLabel>(
    `/labels/product/${encodeURIComponent(id)}`
  );
}

// طبق بخش الف — POST /labels/location/bulk
export function bulkLocationLabels(
  ids: string[]
): Promise<T.LocationLabel[]> {
  return apiFetch<T.LocationLabel[]>("/labels/location/bulk", {
    method: "POST",
    body: { ids },
  });
}

// طبق بخش الف — POST /labels/product/bulk
export function bulkProductLabels(
  ids: string[]
): Promise<T.ProductLabel[]> {
  return apiFetch<T.ProductLabel[]>("/labels/product/bulk", {
    method: "POST",
    body: { ids },
  });
}

// =====================================================
// افزونه ب: تأیید انتخاب دستی صوت (طبق بخش ب سند افزونه)
// =====================================================

// طبق بخش ب — POST /inventory/voice/confirm
export function confirmVoice(
  dto: T.VoiceConfirmDto
): Promise<T.VoiceConfirmResponse> {
  return apiFetch<T.VoiceConfirmResponse>("/inventory/voice/confirm", {
    method: "POST",
    body: dto,
  });
}

// =====================================================
// بازبینی عملیات کارگر (Stage 3 — Manager Review)
// =====================================================

// GET /manager/review/pending — صف تأیید مدیر (اختیاری بر اساس انبار)
export function getPendingOperations(
  warehouseId?: string
): Promise<T.PendingOperation[]> {
  const qs = warehouseId
    ? `?warehouseId=${encodeURIComponent(warehouseId)}`
    : "";
  return apiFetch<T.PendingOperation[]>(`/manager/review/pending${qs}`);
}

// POST /manager/review/:id/approve — تأیید = ثبت واقعی موجودی (idempotent سمت سرور)
export function approvePendingOperation(
  id: string,
  body: { productId?: string; quantity?: number } = {}
): Promise<unknown> {
  return apiFetch(`/manager/review/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body,
  });
}

// POST /manager/review/:id/reject — رد با ذخیره‌ی دلیل
export function rejectPendingOperation(
  id: string,
  body: { reviewNote?: string } = {}
): Promise<unknown> {
  return apiFetch(`/manager/review/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body,
  });
}

// ---- Product creation requests (worker → manager approval) ----
export function getCategories(): Promise<T.Category[]> {
  return apiFetch<T.Category[]>("/categories");
}

export function getProductRequests(
  status?: string
): Promise<T.ProductCreationRequest[]> {
  const qs = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<T.ProductCreationRequest[]>(`/product-requests${qs}`);
}

// POST /product-requests/:id/approve — creates the Product + applies stock (server-side)
export function approveProductRequest(
  id: string,
  body: T.ApproveProductRequestDto = {}
): Promise<unknown> {
  return apiFetch(`/product-requests/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body,
  });
}

export function rejectProductRequest(
  id: string,
  body: { reviewNote?: string } = {}
): Promise<unknown> {
  return apiFetch(`/product-requests/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body,
  });
}

// =====================================================
// فروش — فاکتور، مشتری، کار برداشت
// =====================================================

// GET /inventory/sale/resolve/:barcode — کالا + مکان‌های دارای موجودی، در یک درخواست
export function resolveForSale(barcode: string): Promise<T.SaleResolve> {
  return apiFetch<T.SaleResolve>(
    `/inventory/sale/resolve/${encodeURIComponent(barcode.trim())}`
  );
}

// GET /inventory/product/:id/stock — فقط مکان‌هایی که موجودی مثبت دارند
export function getProductStock(productId: string): Promise<T.StockLocation[]> {
  return apiFetch<T.StockLocation[]>(
    `/inventory/product/${encodeURIComponent(productId)}/stock`
  );
}

// POST /sales/invoices — ثبت فاکتور چندردیفی. اتمیک: یا همه یا هیچ.
export function createInvoice(dto: T.CreateInvoiceDto): Promise<T.Invoice> {
  return apiFetch<T.Invoice>("/sales/invoices", { method: "POST", body: dto });
}

export function getInvoice(id: string): Promise<T.Invoice> {
  return apiFetch<T.Invoice>(`/sales/invoices/${encodeURIComponent(id)}`);
}

export function getInvoices(params: {
  warehouseId?: string;
  customerId?: string;
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ data: T.Invoice[]; meta: { total: number; page: number; pageSize: number; pageCount: number } }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return apiFetch(`/sales/invoices?${qs.toString()}`);
}

export function cancelInvoice(id: string, reason: string): Promise<T.Invoice> {
  return apiFetch<T.Invoice>(`/sales/invoices/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: { reason },
  });
}

// GET /sales/customers — q روی نام، فامیل و شماره‌ی ناقص کار می‌کند
export function searchCustomers(
  q: string,
  pageSize = 20
): Promise<T.Customer[]> {
  const qs = new URLSearchParams({ pageSize: String(pageSize) });
  if (q) qs.set("q", q);
  return apiFetch<{ data: T.Customer[] }>(`/sales/customers?${qs.toString()}`).then(
    (r) => r.data ?? []
  );
}

export function getCustomer(id: string): Promise<T.Customer> {
  return apiFetch<T.Customer>(`/sales/customers/${encodeURIComponent(id)}`);
}

// فقط firstName الزامی است — ثبت مشتری بدون شماره باید ممکن باشد
export function createCustomer(body: {
  firstName: string;
  lastName?: string;
  note?: string;
  phones?: { phone: string; label?: string; isPrimary?: boolean }[];
}): Promise<T.Customer> {
  return apiFetch<T.Customer>("/sales/customers", { method: "POST", body });
}

// POST /pick-tasks — ارسال لوکیشن کالا به گوشی کارگر
export function createPickTasks(body: {
  warehouseId: string;
  invoiceId?: string | null;
  /** null یا نبود = «هر کارگری»؛ مقدار = آن کارگر مشخص. */
  assignedToId?: string | null;
  lines: { productId: string; locationId: string; quantity: number; note?: string }[];
}): Promise<T.PickTask[]> {
  return apiFetch<T.PickTask[]>("/pick-tasks", { method: "POST", body });
}

/** فهرست کارگرها برای انتخاب گیرنده‌ی کار برداشت. */
export function getWorkers(): Promise<T.Worker[]> {
  return apiFetch<T.Worker[]>("/pick-tasks/workers");
}

export function getPickTasks(params: {
  status?: T.PickTaskStatus;
  warehouseId?: string;
} = {}): Promise<T.PickTask[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, String(v));
  return apiFetch<T.PickTask[]>(`/pick-tasks?${qs.toString()}`);
}

// =====================================================
// گزارش‌ها
// =====================================================

export interface ReportRange {
  startDate: string;
  endDate: string;
  page?: number;
  limit?: number;
}

function reportQs(params: object): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return qs.toString();
}

export function getPeriodicSales(p: ReportRange) {
  return apiFetch<T.PeriodicSalesReport>(`/reports/periodic-sales?${reportQs(p)}`);
}

export function getPeriodicProfit(p: ReportRange) {
  return apiFetch<T.PeriodicProfitReport>(`/reports/periodic-profit?${reportQs(p)}`);
}

export function getDebtors(p: { page?: number; limit?: number }) {
  return apiFetch<T.DebtorsReport>(`/reports/debtors?${reportQs(p)}`);
}

export function getChequesReport(p: { status?: string; page?: number; limit?: number }) {
  return apiFetch<T.ChequesReport>(`/reports/cheques?${reportQs(p)}`);
}

export function getProductPerformance(p: ReportRange & { type?: string }) {
  return apiFetch<T.ProductPerformanceReport>(`/reports/product-performance?${reportQs(p)}`);
}

export function getLowStock(p: { page?: number; limit?: number }) {
  return apiFetch<T.LowStockReport>(`/reports/low-stock?${reportQs(p)}`);
}

export function getSellerPerformance(p: ReportRange) {
  return apiFetch<T.SellerPerformanceReport>(`/reports/seller-performance?${reportQs(p)}`);
}

/**
 * دانلود خروجی اکسل هر گزارش.
 * توکن باید دستی ضمیمه شود چون این مسیر از apiFetch رد نمی‌شود (پاسخ باینری است).
 */
export async function downloadReportExcel(
  endpoint: string,
  params: Record<string, unknown>,
  fileName: string
): Promise<void> {
  const token = useAuthStore.getState().token;
  const qs = reportQs({ ...params, format: "excel" });

  const res = await fetch(`${API_URL}${endpoint}?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new ApiException(res.status, {
      error: "EXPORT_FAILED",
      message: "گرفتن خروجی اکسل ناموفق بود",
    });
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// =====================================================
// بک‌آپ
// =====================================================

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
  /** سرور تصمیم می‌گیرد یادآوری لازم است یا نه، نه کلاینت. */
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

export function getBackupStatus(): Promise<BackupStatus> {
  return apiFetch<BackupStatus>("/backups/status");
}

export function getBackupHistory(limit = 30): Promise<BackupRun[]> {
  return apiFetch<BackupRun[]>(`/backups/history?limit=${limit}`);
}

export function updateBackupConfig(
  dto: Partial<Omit<BackupConfig, "id">>
): Promise<BackupConfig> {
  return apiFetch<BackupConfig>("/backups/config", { method: "PUT", body: dto });
}

export function runBackup(trigger: "MANUAL" | "ON_CLOSE" = "MANUAL"): Promise<BackupRun> {
  return apiFetch<BackupRun>("/backups/run", { method: "POST", body: { trigger } });
}

// =====================================================
// دریافت وجه از بدهکار
// =====================================================

export function createReceipt(body: {
  idempotencyKey?: string;
  customerId: string;
  amount: number;
  method: T.PaymentMethod;
  note?: string;
  cheque?: T.ChequeInput;
}): Promise<T.Receipt> {
  return apiFetch<T.Receipt>("/sales/receipts", { method: "POST", body });
}

export function getReceipts(p: { customerId?: string; page?: number; limit?: number } = {}) {
  return apiFetch<{ data: T.Receipt[]; meta: T.ReportMeta }>(
    `/sales/receipts?${reportQs(p)}`
  );
}

export function getReceipt(id: string): Promise<T.Receipt> {
  return apiFetch<T.Receipt>(`/sales/receipts/${encodeURIComponent(id)}`);
}

// =====================================================
// پیش‌فاکتور
// =====================================================

export function createQuotation(body: {
  warehouseId: string;
  customerId?: string | null;
  discount?: number;
  note?: string;
  validForMinutes: number;
  lines: {
    productId: string;
    locationId?: string;
    quantity: number;
    unitPrice: number;
    /** تخفیف ردیف به تومان — سرور آن را از جمع ردیف کم می‌کند. */
    discount?: number;
  }[];
}): Promise<T.Quotation> {
  return apiFetch<T.Quotation>("/sales/quotations", { method: "POST", body });
}

export function getQuotations(p: {
  status?: string;
  customerId?: string;
  page?: number;
  limit?: number;
} = {}) {
  return apiFetch<{ data: T.Quotation[]; meta: T.ReportMeta }>(
    `/sales/quotations?${reportQs(p)}`
  );
}

export function getQuotation(id: string): Promise<T.Quotation> {
  return apiFetch<T.Quotation>(`/sales/quotations/${encodeURIComponent(id)}`);
}

/**
 * تبدیل پیش‌فاکتور به فاکتور.
 *
 * `payments` باید فرستاده شود. سرور آن را به createInvoice پاس می‌دهد و اگر
 * خالی برود فاکتور با `paidAmount = 0` ثبت می‌شود — یعنی هر تبدیل بی‌صدا یک
 * بدهیِ تمام‌مبلغ می‌سازد، حتی برای فروشی که نقد تسویه شده.
 */
export function convertQuotation(
  id: string,
  payments?: T.PaymentInput[]
): Promise<T.Invoice> {
  return apiFetch<T.Invoice>(`/sales/quotations/${encodeURIComponent(id)}/convert`, {
    method: "POST",
    body: { payments },
  });
}

export function extendQuotation(id: string, validForMinutes: number): Promise<T.Quotation> {
  return apiFetch<T.Quotation>(`/sales/quotations/${encodeURIComponent(id)}/extend`, {
    method: "POST",
    body: { validForMinutes },
  });
}

export function cancelQuotation(id: string): Promise<T.Quotation> {
  return apiFetch<T.Quotation>(`/sales/quotations/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}

// =====================================================
// صف چاپ لیبل + تنظیمات پیش‌فرض
// =====================================================

export function getPendingLabels(p: {
  onlyWithStock?: boolean;
  since?: string;
  page?: number;
  limit?: number;
} = {}) {
  return apiFetch<{ data: T.PendingLabelProduct[]; meta: T.ReportMeta }>(
    `/products/labels/pending?${reportQs(p)}`
  );
}

export function getLabelSettings(): Promise<T.LabelSettings> {
  return apiFetch<T.LabelSettings>("/labels/settings");
}

export function updateLabelSettings(
  body: Partial<T.LabelSettings>
): Promise<T.LabelSettings> {
  return apiFetch<T.LabelSettings>("/labels/settings", { method: "PUT", body });
}
