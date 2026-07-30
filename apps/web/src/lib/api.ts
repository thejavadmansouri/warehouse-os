// wrapper مرکزی fetch — طبق بخش ۳، ۴ و ۵ سند
// هیچ‌جای کامپوننت نباید مستقیم fetch صدا بزند؛ همه‌چیز از همین فایل رد می‌شود.
import { useAuthStore } from "./auth-store";
import { ApiException } from "./api-error-messages";
import type { ApiErrorBody } from "./types";
import * as T from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

// ----- کمک‌کننده‌های داخلی -----

function buildInit(init: RequestInit): RequestInit {
  const { body, headers, ...rest } = init;
  const finalHeaders: Record<string, string> = {
    ...((headers as Record<string, string>) ?? {}),
  };
  let finalBody: BodyInit | undefined = body;
  if (body && !(body instanceof FormData) && typeof body === "object") {
    finalBody = JSON.stringify(body);
    if (!finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }
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
  init: RequestInit = {}
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
async function apiFetch<R>(path: string, init: RequestInit = {}): Promise<R> {
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
        window.location.href = "/login";
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

// =====================================================
// ۶.۳. محصولات
// =====================================================

// طبق بخش ۶.۳ — GET /products (آرایه خام، بدون صفحه‌بندی)
export function getProducts(): Promise<T.Product[]> {
  return apiFetch<T.Product[]>("/products");
}

// طبق بخش ۶.۳ — GET /products/search?q=
export function searchProducts(q: string): Promise<T.Product[]> {
  const qs = new URLSearchParams({ q });
  return apiFetch<T.Product[]>(`/products/search?${qs.toString()}`);
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

// طبق بخش ۶.۶ — GET /locations/children?parentId=
export function getLocationChildren(
  parentId?: string
): Promise<T.Location[]> {
  const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
  return apiFetch<T.Location[]>(`/locations/children${qs}`);
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

// طبق بخش ۶.۶ — GET /location-types
export function getLocationTypes(): Promise<T.LocationType[]> {
  return apiFetch<T.LocationType[]>("/location-types");
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
