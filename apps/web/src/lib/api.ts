// wrapper مرکزی fetch — طبق بخش ۳، ۴ و ۵ سند
// هیچ‌جای کامپوننت نباید مستقیم fetch صدا بزند؛ همه‌چیز از همین فایل رد می‌شود.
import { useAuthStore } from "./auth-store";
import { useConnectionStore } from "./connection-store";
import { ApiException } from "./api-error-messages";
import type { ApiErrorBody } from "./types";
import * as T from "./types";

/**
 * پورتی که API روی آن گوش می‌دهد. بین همه‌ی نصب‌ها یکی است، پس در build ماندنش
 * اشکالی ندارد — برخلاف میزبان.
 */
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? "3000";

/**
 * آدرس API — **در زمان اجرا** از خودِ مرورگر گرفته می‌شود، نه از build.
 *
 * قبلاً `NEXT_PUBLIC_API_URL` بود و Next آن را موقع build داخل کد می‌نوشت. یعنی
 * آی‌پیِ ماشینی که build روی آن انجام شده داخل نسخه‌ی نهایی حک می‌شد؛ همان نسخه
 * روی سرور مشتری هیچ‌وقت کار نمی‌کرد و هر بار عوض‌شدن آی‌پی سرور یک build دوباره
 * می‌خواست — روی ماشینی که ابزار build ندارد.
 *
 * حالا هر مرورگری که صفحه را باز می‌کند، API را روی همان میزبانی صدا می‌زند که
 * صفحه را از آن گرفته. سیستم فروشنده، گوشیِ روی وای‌فای، یا خودِ سرور — هر سه
 * بدون هیچ تنظیمی درست کار می‌کنند، و عوض‌شدن آی‌پی سرور خودبه‌خود دنبال می‌شود.
 *
 * عمداً راهی برای override در build نگذاشته‌ام: همان قابلیت بود که آی‌پی اشتباه
 * را داخل نسخه‌ی تحویلی می‌برد.
 */
function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }
  // رندر سمت سرور: هیچ درخواستی از اینجا زده نمی‌شود، ولی مقدار باید معتبر بماند.
  return `http://127.0.0.1:${API_PORT}`;
}

/**
 * ⚠️ تابع است، نه ثابت.
 *
 * اگر در سطح ماژول یک بار ارزیابی شود، در رندر سمت سرور روی 127.0.0.1 قفل
 * می‌شود و همان مقدار به مرورگر می‌رسد — یعنی سیستم فروشنده به خودش درخواست
 * می‌دهد نه به سرور.
 */
export function apiUrl(): string {
  return resolveApiUrl();
}

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
  if (status === 429) return "تلاش‌های زیاد — کمی صبر کنید و دوباره امتحان کنید";
  if (status >= 500) return "خطای سمت سرور";
  return "خطای غیرمنتظره";
}

/**
 * بدنه‌ی خطای سرور → شکلی که کلاینت می‌فهمد.
 *
 * ⚠️ پیامِ سرور هیچ‌وقت نباید بی‌صدا دور ریخته شود.
 *
 * قبلاً فقط شکلِ `{ error, message }` پذیرفته می‌شد و هر چیز دیگری به پیام
 * عمومی تبدیل می‌شد. قفلِ ورود بدنه‌اش یک رشته‌ی خام بود، پس کاربرِ قفل‌شده
 * «خطای غیرمنتظره» می‌دید و فکر می‌کرد رمزش غلط است — پنج دقیقه، بدون هیچ
 * سرنخی. حالا هر سه شکل خوانده می‌شود و پیامِ سرور برنده است.
 */
function toErrorBody(parsed: unknown, status: number): ApiErrorBody {
  const fallback = { error: `HTTP_${status}`, message: defaultStatusMessage(status) };

  // بدنه‌ی رشته‌ای — مثل `new HttpException('متن', status)` در Nest.
  if (typeof parsed === "string" && parsed.trim()) {
    return { ...fallback, message: parsed };
  }

  if (parsed && typeof parsed === "object") {
    const body = parsed as Partial<ApiErrorBody>;
    // آرایه‌ی `message`ِ ValidationPipe دست‌نخورده رد می‌شود؛ ساختنِ متن کارِ
    // `resolveApiError` است و اینجا تکرارش فقط دو جداکننده‌ی متفاوت می‌سازد.
    const hasMessage =
      typeof body.message === "string" ? body.message.trim() !== "" : Array.isArray(body.message);

    return {
      ...fallback,
      ...body,
      error: typeof body.error === "string" ? body.error : fallback.error,
      message: hasMessage ? body.message : fallback.message,
    } as ApiErrorBody;
  }

  return fallback;
}

// fetch پایین‌سطحی — بدون تزریق خودکار توکن، بدون redirect
async function rawFetch<R>(
  path: string,
  init: ApiRequestInit = {}
): Promise<R> {
  let res: Response;

  /*
   * تفکیکِ «سرور نیست» از «سرور جواب داد ولی خطا داد».
   *
   * fetch فقط وقتی throw می‌کند که اصلاً نتواند به سرور برسد. هر پاسخی — حتی
   * ۴۰۱ یا ۵۰۰ — یعنی سرور بالاست. این تنها نقطه‌ای است که همه‌ی درخواست‌های
   * پنل از آن رد می‌شوند، پس وضعیت ارتباط همین‌جا به‌روز می‌شود و هیچ صفحه‌ای
   * لازم نیست خودش چیزی چک کند.
   */
  try {
    res = await fetch(`${apiUrl()}${path}`, {
      credentials: "include",
      ...buildInit(init),
    });
  } catch (e) {
    useConnectionStore.getState().setOnline(false);
    throw e;
  }

  useConnectionStore.getState().setOnline(true);

  if (!res.ok) {
    throw new ApiException(res.status, toErrorBody(await parseJson(res), res.status));
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
  if (path.startsWith("/")) return `${apiUrl()}${path}`;
  return `${apiUrl()}/${path}`;
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

/**
 * One page of the POS product catalog (lean rows + sale price) for the
 * in-browser local search. Paginated + incremental by `updatedSince` so a
 * refresh only pulls what changed. Stock and location are deliberately NOT here
 * — those are fetched fresh when a product is actually picked, so the seller
 * never acts on a stale stock number.
 */
/**
 * Fresh stock/location for ONE product, fetched at the moment the seller picks
 * a result from the local catalog search (which has no stock data by design —
 * caching it would mean selling against a number that can go stale).
 */
export function getPosStock(productId: string): Promise<T.LocateResult> {
  return apiFetch<T.LocateResult>(`/products/${productId}/pos-stock`);
}

export function getPosCatalog(
  page: number,
  limit: number,
  updatedSince?: string,
): Promise<T.PosCatalogPage> {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (updatedSince) qs.set("updatedSince", updatedSince);
  return apiFetch<T.PosCatalogPage>(`/products/pos-catalog?${qs.toString()}`);
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
  const res = await fetch(`${apiUrl()}/products/export`, {
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
  const res = await fetch(`${apiUrl()}/labels/product/print`, {
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
  const res = await fetch(`${apiUrl()}/labels/stock/print`, {
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

// GET /warehouses/inactive (ADMIN/MANAGER) — برای بخشِ بازگردانی
export function getInactiveWarehouses(): Promise<T.Warehouse[]> {
  return apiFetch<T.Warehouse[]>("/warehouses/inactive");
}

// POST /warehouses/:id/reactivate (ADMIN/MANAGER)
export function reactivateWarehouse(
  id: string
): Promise<T.ReactivateWarehouseResult> {
  return apiFetch<T.ReactivateWarehouseResult>(
    `/warehouses/${encodeURIComponent(id)}/reactivate`,
    { method: "POST" }
  );
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
// اگر قفسه موجودی داشته باشد، stockOpts (انتقال/تصفیه) الزامی است؛ وگرنه سرور
// خطای LOCATION_HAS_STOCK می‌دهد تا UI انتخاب بگیرد.
export function deleteLocation(
  id: string,
  stockOpts?: T.RemoveLocationStockOptions
): Promise<T.DeleteLocationResult> {
  return apiFetch<T.DeleteLocationResult>(
    `/locations/${encodeURIComponent(id)}`,
    { method: "DELETE", body: stockOpts ?? undefined }
  );
}

// POST /locations/bulk-delete (ADMIN/MANAGER)
export function bulkDeleteLocations(
  ids: string[],
  stockOpts?: T.RemoveLocationStockOptions
): Promise<T.BulkDeleteLocationsResult> {
  return apiFetch<T.BulkDeleteLocationsResult>("/locations/bulk-delete", {
    method: "POST",
    body: { ids, ...(stockOpts ?? {}) },
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

// کاردکس کالا — GET /inventory/kardex/:productId
export function getProductKardex(
  productId: string,
  query: T.KardexQuery = {}
): Promise<T.KardexResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") {
      qs.set(k, String(v));
    }
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<T.KardexResponse>(
    `/inventory/kardex/${encodeURIComponent(productId)}${suffix}`
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

// POST /manager/review/approve-many — تأیید گروهیِ آماده‌ها (idempotent per-item)
export function approvePendingOperationsMany(
  ids: string[]
): Promise<{ approved: number; failedCount: number; failed: { id: string; message: string }[] }> {
  return apiFetch("/manager/review/approve-many", {
    method: "POST",
    body: { ids },
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
  /** فروشنده‌ی ثبت‌کننده. */
  userId?: string;
  /** فقط فاکتورهای مانده‌دار ("true") یا فقط تسویه‌شده‌ها ("false"). */
  hasDue?: "true" | "false";
  /** ردیف‌های فاکتور (اقلام) هم در پاسخ بیایند — برای کاردکس مشتری. */
  includeLines?: boolean;
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

// ----- برگشت از فروش (مرجوعی) -----

/** ردیف‌های قابل‌برگشتِ یک فاکتور — فروخته، مرجوعیِ قبلی، و قابل‌برگشت هر قلم. */
export function getReturnableLines(invoiceId: string): Promise<T.ReturnableInvoice> {
  return apiFetch<T.ReturnableInvoice>(
    `/sales/invoices/${encodeURIComponent(invoiceId)}/returnable`
  );
}

// POST /sales/returns — ثبت مرجوعی. اتمیک: موجودی، دفتر و سند با هم یا هیچ‌کدام.
export function createReturn(dto: T.CreateReturnDto): Promise<T.SaleReturn> {
  return apiFetch<T.SaleReturn>("/sales/returns", { method: "POST", body: dto });
}

export function getReturns(params: {
  warehouseId?: string;
  customerId?: string;
  invoiceId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ data: T.SaleReturnListRow[]; meta: T.ReportMeta }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return apiFetch(`/sales/returns?${qs.toString()}`);
}

export function getReturn(id: string): Promise<T.SaleReturn> {
  return apiFetch<T.SaleReturn>(`/sales/returns/${encodeURIComponent(id)}`);
}

// ----- اصلاحیه فاکتور -----

/** ردیف‌های قابل‌اصلاحِ یک فاکتور — وضعیت فعلی هر قلم (فروش + اصلاحیه‌های قبلی). */
export function getCorrectableLines(invoiceId: string): Promise<T.CorrectableInvoice> {
  return apiFetch<T.CorrectableInvoice>(
    `/sales/invoices/${encodeURIComponent(invoiceId)}/correctable`
  );
}

// POST /sales/corrections — ثبت اصلاحیه: سندِ جدا با شماره‌ی خودش و دلیلِ اجباری.
export function createCorrection(dto: T.CreateCorrectionDto): Promise<T.SaleCorrection> {
  return apiFetch<T.SaleCorrection>("/sales/corrections", { method: "POST", body: dto });
}

export function getCorrections(params: {
  warehouseId?: string;
  customerId?: string;
  invoiceId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ data: T.SaleCorrectionListRow[]; meta: T.ReportMeta }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return apiFetch(`/sales/corrections?${qs.toString()}`);
}

export function getCorrection(id: string): Promise<T.SaleCorrection> {
  return apiFetch<T.SaleCorrection>(`/sales/corrections/${encodeURIComponent(id)}`);
}

export type CustomerSort = "name" | "newest" | "dueDesc" | "dueAsc";

/**
 * GET /sales/customers — صفحه‌بندی‌شده، با مانده‌ی هر مشتری.
 * `sortBy` روی مانده‌ی دفتر هم کار می‌کند (بیشترین/کمترین بدهی).
 */
export function searchCustomersPaged(params: {
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: CustomerSort;
  /** فیلتر بر اساس دسته — فقط مشتری‌های یک دسته. */
  categoryId?: string;
  /** فقط کسانی که مانده‌ی بدهی دارند. */
  onlyDebtors?: boolean;
}): Promise<{
  data: T.Customer[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
}> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return apiFetch(`/sales/customers?${qs.toString()}`);
}

// GET /sales/customers — q روی نام، فامیل و شماره‌ی ناقص کار می‌کند.
// نسخه‌ی سبک برای پیکرهای انتخابِ مشتری در صندوق — بدون صفحه‌بندی.
export function searchCustomers(
  q: string,
  pageSize = 20
): Promise<T.Customer[]> {
  return searchCustomersPaged({ q, pageSize }).then((r) => r.data ?? []);
}

export function getCustomer(id: string): Promise<T.Customer> {
  return apiFetch<T.Customer>(`/sales/customers/${encodeURIComponent(id)}`);
}

// ----- مشخصات مغازه -----

export function getShopSettings(): Promise<T.ShopSettings> {
  return apiFetch<T.ShopSettings>("/shop-settings");
}

export function updateShopSettings(
  body: Partial<T.ShopSettings>
): Promise<T.ShopSettings> {
  return apiFetch<T.ShopSettings>("/shop-settings", { method: "PUT", body });
}

/** ویرایش مشتری — شامل سقف اعتبار و مهلت پیش‌فرض. */
export function updateCustomer(
  id: string,
  body: {
    firstName?: string;
    lastName?: string;
    address?: string;
    nationalId?: string;
    categoryId?: string;
    note?: string;
    smsOptOut?: boolean;
    creditLimit?: number;
    creditDays?: number;
    /** نرخِ فروشِ مدت‌دار به پایه‌ی هزارم. ۲۵۰ = ۲.۵٪ */
    chequeRateBp?: number;
    chequeRateMode?: "FLAT" | "MONTHLY";
  }
): Promise<T.Customer> {
  return apiFetch<T.Customer>(`/sales/customers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

/**
 * غیرفعال‌سازی مشتری — soft delete (رکورد پاک نمی‌شود، فقط از انتخاب‌ها می‌افتد).
 * فقط ADMIN/MANAGER. مشتریِ دارای مانده (بدهی یا بستانکاری) توسط سرور رد می‌شود.
 */
export function deactivateCustomer(id: string): Promise<T.Customer> {
  return apiFetch<T.Customer>(`/sales/customers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** آمار خرید دوره‌ای مشتری — این ماه، ماه قبل، کل و میانگین فاکتور. */
export function getCustomerStats(id: string): Promise<T.CustomerPurchaseStats> {
  return apiFetch<T.CustomerPurchaseStats>(
    `/sales/customers/${encodeURIComponent(id)}/stats`
  );
}

/** افزودن شماره به بانک شماره‌ی مشتری — با برچسب (موبایل/ثابت/محل کار). */
export function addCustomerPhone(
  id: string,
  body: { phone: string; label?: string; isPrimary?: boolean }
): Promise<T.Customer> {
  return apiFetch<T.Customer>(`/sales/customers/${encodeURIComponent(id)}/phones`, {
    method: "POST",
    body,
  });
}

/** حذف شماره از بانک شماره‌ی مشتری. */
export function removeCustomerPhone(id: string, phoneId: string): Promise<T.Customer> {
  return apiFetch<T.Customer>(
    `/sales/customers/${encodeURIComponent(id)}/phones/${encodeURIComponent(phoneId)}`,
    { method: "DELETE" }
  );
}

/** تعیین شماره‌ی اصلی مشتری — بقیه‌ی شماره‌های او غیراصلی می‌شوند. */
export function setPrimaryCustomerPhone(
  id: string,
  phoneId: string
): Promise<T.Customer> {
  return apiFetch<T.Customer>(
    `/sales/customers/${encodeURIComponent(id)}/phones/${encodeURIComponent(phoneId)}/primary`,
    { method: "POST" }
  );
}

/**
 * بررسی سقف اعتبار پیش از ثبت فروش حساب‌باز.
 *
 * عمداً جدا از ثبت است تا فروشنده هشدار را *قبل* از زدن دکمه ببیند. عبور از
 * سقف جلوی فروش را نمی‌گیرد — فقط عدد را نشان می‌دهد.
 */
export function creditCheck(
  customerId: string,
  amount: number
): Promise<T.CreditCheck> {
  return apiFetch<T.CreditCheck>(
    `/sales/customers/${encodeURIComponent(customerId)}/credit-check?amount=${amount}`
  );
}

/**
 * مشتریانِ دارای حساب باز.
 *
 * بدترین وضعیت اول مرتب شده (معوق → سررسید امروز → بزرگ‌ترین بدهی)، پس صفحه
 * لازم نیست دوباره مرتبش کند.
 */
export function getOpenAccounts(
  params: { q?: string; onlyOverdue?: boolean; page?: number; limit?: number } = {}
): Promise<{ data: T.Debtor[]; meta: { total: number; page: number; limit: number } }> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.onlyOverdue) qs.set("onlyOverdue", "true");
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  return apiFetch(`/sales/debtors?${qs.toString()}`);
}

/**
 * صورت‌حسابِ کاملِ مشتری — همه‌ی کالاها و همه‌ی پرداخت‌ها با جزئیات.
 * بدونِ بازه یعنی از اول تا امروز.
 */
export function getCustomerFullStatement(
  id: string,
  range: { startDate?: string; endDate?: string } = {},
): Promise<T.CustomerFullStatement> {
  const qs = new URLSearchParams();
  if (range.startDate) qs.set("startDate", range.startDate);
  if (range.endDate) qs.set("endDate", range.endDate);
  const q = qs.toString();
  return apiFetch(
    `/sales/customers/${encodeURIComponent(id)}/full-statement${q ? `?${q}` : ""}`,
  );
}

// ----- چرخه‌ی چک -----

/** به بانک سپرده شد — فقط وضعیت، بدون اثر مالی. */
export function depositCheque(id: string): Promise<unknown> {
  return apiFetch(`/sales/cheques/${encodeURIComponent(id)}/deposit`, {
    method: "POST",
  });
}

/** وصول شد. اگر چک قبلاً برگشت خورده باشد، اثر برگشت خنثی می‌شود. */
export function cashCheque(id: string): Promise<unknown> {
  return apiFetch(`/sales/cheques/${encodeURIComponent(id)}/cash`, {
    method: "POST",
  });
}

/** برگشت خورد — بدهی مشتری برمی‌گردد. */
export function bounceCheque(id: string, reason?: string): Promise<unknown> {
  return apiFetch(`/sales/cheques/${encodeURIComponent(id)}/bounce`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ----- حساب باز (فاکتور کلیِ جاری) -----

/** فهرستِ حساب‌های بازِ فعال — دکمه‌ی «حساب باز» در صندوق. */
export function listOpenAccounts(): Promise<T.OpenAccountSummary[]> {
  return apiFetch("/sales/open-accounts");
}

/** پرونده‌ی یک حساب باز — همه‌ی فاکتورهای باز با ردیف‌هایشان. */
export function getOpenAccount(id: string): Promise<T.OpenAccountDetail> {
  return apiFetch(`/sales/open-accounts/${encodeURIComponent(id)}`);
}

/**
 * برگه‌ی تجمیعیِ کلِ حساب — برای چاپ.
 * فاکتورهای تسویه‌شده را هم می‌آورد، پس بعد از تسویه هم کار می‌کند.
 */
export function getOpenAccountSheet(id: string): Promise<T.OpenAccountSheet> {
  return apiFetch(`/sales/open-accounts/${encodeURIComponent(id)}/sheet`);
}

/** باز کردن حساب برای مشتری (idempotent). */
export function ensureOpenAccount(customerId: string): Promise<T.OpenAccountDetail> {
  return apiFetch(`/sales/customers/${encodeURIComponent(customerId)}/open-account`, {
    method: "POST",
  });
}

/** تسویه — همه‌ی فاکتورهای بازِ حساب CONFIRMED می‌شوند. */
export function settleOpenAccount(id: string): Promise<T.OpenAccountDetail> {
  return apiFetch(`/sales/open-accounts/${encodeURIComponent(id)}/settle`, {
    method: "POST",
  });
}

export function getReceivablesSummary(): Promise<T.ReceivablesSummary> {
  return apiFetch("/sales/receivables/summary");
}

export function getAlerts(): Promise<T.Alerts> {
  return apiFetch("/sales/alerts");
}

/**
 * صورتحساب مشتری — گردش با مانده‌ی متحرک و خلاصه‌ی بازه.
 * startDate/endDate اختیاری‌اند؛ بدون بازه، کلِ تاریخچه با closingBalance واقعی می‌آید.
 */
export function getStatement(
  customerId: string,
  params: { startDate?: string; endDate?: string; page?: number; limit?: number } = {}
): Promise<T.StatementResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  return apiFetch(
    `/sales/customers/${encodeURIComponent(customerId)}/statement?${qs.toString()}`
  );
}

/** مانده‌ی اول دوره — فقط یک بار برای هر مشتری، فقط مدیر. */
export function setOpeningBalance(
  customerId: string,
  amount: number,
  note?: string
): Promise<T.LedgerEntry> {
  return apiFetch(
    `/sales/customers/${encodeURIComponent(customerId)}/opening-balance`,
    { method: "POST", body: { amount, note } }
  );
}

/** اصلاح دستی حساب — دلیل اجباری است. */
export function adjustBalance(
  customerId: string,
  amount: number,
  reason: string
): Promise<T.LedgerEntry> {
  return apiFetch(`/sales/customers/${encodeURIComponent(customerId)}/adjust`, {
    method: "POST",
    body: { amount, reason },
  });
}

// فقط firstName الزامی است — ثبت مشتری بدون شماره باید ممکن باشد
export function createCustomer(body: {
  firstName: string;
  lastName?: string;
  address?: string;
  nationalId?: string;
  categoryId?: string;
  note?: string;
  phones?: { phone: string; label?: string; isPrimary?: boolean }[];
  /** حساب باز — سقف اعتبار (۰ = بدون سقف). */
  creditLimit?: number;
  /** حساب باز — مهلت پرداخت به روز. */
  creditDays?: number;
}): Promise<T.Customer> {
  return apiFetch<T.Customer>("/sales/customers", { method: "POST", body });
}

// ----- دسته‌های مشتری -----

/** همه‌ی دسته‌ها با شمارش مشتری — صفحه‌ی مدیریت (فقط مدیر). */
export function getCustomerCategories(): Promise<T.CustomerCategory[]> {
  return apiFetch<T.CustomerCategory[]>("/sales/customer-categories");
}

/** فقط دسته‌های فعال — برای dropdown فرم‌ها و فیلتر. */
export function getActiveCustomerCategories(): Promise<T.CustomerCategory[]> {
  return apiFetch<T.CustomerCategory[]>("/sales/customer-categories/active");
}

export function createCustomerCategory(body: {
  name: string;
  color?: string;
  sortOrder?: number;
}): Promise<T.CustomerCategory> {
  return apiFetch<T.CustomerCategory>("/sales/customer-categories", {
    method: "POST",
    body,
  });
}

export function updateCustomerCategory(
  id: string,
  body: {
    name?: string;
    color?: string;
    sortOrder?: number;
    isActive?: boolean;
  }
): Promise<T.CustomerCategory> {
  return apiFetch<T.CustomerCategory>(
    `/sales/customer-categories/${encodeURIComponent(id)}`,
    { method: "PATCH", body }
  );
}

/** غیرفعال‌سازی — مشتری‌ها دست نمی‌خورند، فقط از انتخاب‌های جدید می‌افتد. */
export function deactivateCustomerCategory(id: string): Promise<T.CustomerCategory> {
  return apiFetch<T.CustomerCategory>(
    `/sales/customer-categories/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

// POST /pick-tasks — ارسال لوکیشن کالا به گوشی کارگر
export function createPickTasks(body: {
  warehouseId: string;
  invoiceId?: string | null;
  /** null یا نبود = «هر کارگری»؛ مقدار = آن کارگر مشخص. */
  assignedToId?: string | null;
  lines: {
    productId: string;
    /** نبودنش یعنی کالا در سیستم ثبت نشده — کارگر خودش پیدایش می‌کند. */
    locationId?: string;
    quantity: number;
    note?: string;
  }[];
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

// ----- کارِ کارگر (WorkTask) — فقط تابلوی کار و پیشرفت؛ هیچ ربطی به موجودی -----

/**
 * POST /work-tasks — ساخت کارِ کارگر از سبد/فاکتور. موجودی دست نمی‌خورد.
 * `idempotencyKey` یکتا ارسالِ دوباره را بی‌اثر می‌کند (دبل‌کلیک یا retry شبکه).
 */
export function createWorkTask(body: {
  warehouseId: string;
  invoiceId?: string | null;
  /** null یا نبود = «هر کارگری»؛ مقدار = آن کارگر مشخص. */
  assignedToId?: string | null;
  note?: string;
  idempotencyKey: string;
  lines: {
    productId: string;
    /** نبودنش یعنی کالا در سیستم ثبت نشده — کارگر خودش پیدایش می‌کند. */
    locationId?: string;
    quantity: number;
  }[];
}): Promise<T.WorkTask> {
  return apiFetch<T.WorkTask>("/work-tasks", { method: "POST", body });
}

/** GET /work-tasks — همه‌ی کارها با پیشرفت (نمای مدیر/فروشنده برای POS). */
export function getWorkTasks(params: {
  status?: T.WorkTaskStatus;
  warehouseId?: string;
  invoiceId?: string;
} = {}): Promise<T.WorkTask[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, String(v));
  return apiFetch<T.WorkTask[]>(`/work-tasks?${qs.toString()}`);
}

/** GET /work-tasks/:id — جزئیات کامل با آیتم‌ها. */
export function getWorkTask(id: string): Promise<T.WorkTask> {
  return apiFetch<T.WorkTask>(`/work-tasks/${encodeURIComponent(id)}`);
}

/** POST /work-tasks/:id/cancel — لغو کارِ در انتظار/در جریان. */
export function cancelWorkTask(id: string, reason?: string): Promise<T.WorkTask> {
  return apiFetch<T.WorkTask>(`/work-tasks/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: reason ? { reason } : undefined,
  });
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

// =====================================================
// کسری محصول — تقاضایی که جواب نگرفت
// =====================================================

export function createShortage(body: T.CreateShortageInput): Promise<T.ProductShortage> {
  return apiFetch<T.ProductShortage>("/shortages", { method: "POST", body });
}

export function getShortages(p: { status?: string; warehouseId?: string } = {}) {
  const qs = new URLSearchParams();
  if (p.status) qs.set("status", p.status);
  if (p.warehouseId) qs.set("warehouseId", p.warehouseId);
  return apiFetch<T.ProductShortage[]>(`/shortages?${qs.toString()}`);
}

export function resolveShortage(
  id: string,
  body: { status: "ORDERED" | "DISMISSED"; note?: string }
): Promise<T.ProductShortage> {
  return apiFetch<T.ProductShortage>(`/shortages/${id}/resolve`, {
    method: "PATCH",
    body,
  });
}

export function getSuspiciousPrices(p: { page?: number; limit?: number }) {
  return apiFetch<T.SuspiciousPricesReport>(`/reports/suspicious-prices?${reportQs(p)}`);
}

export function getSellerPerformance(p: ReportRange) {
  return apiFetch<T.SellerPerformanceReport>(`/reports/seller-performance?${reportQs(p)}`);
}

export function getSalesByCategory(p: ReportRange) {
  return apiFetch<T.SalesByCategoryReport>(`/reports/sales-by-category?${reportQs(p)}`);
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

  const res = await fetch(`${apiUrl()}${endpoint}?${qs}`, {
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

/** فایل‌های بک‌آپِ موجود روی سرور. */
export function getBackupFiles(): Promise<T.BackupFilesResponse> {
  return apiFetch<T.BackupFilesResponse>("/backups/files");
}

export function getRestoreHistory(limit = 20): Promise<T.RestoreRun[]> {
  return apiFetch<T.RestoreRun[]>(`/backups/restore-history?limit=${limit}`);
}

/**
 * دانلود یک فایل بک‌آپ.
 *
 * تنها راهِ نگه‌داشتنِ نسخه‌ای **بیرون از سرور**. بک‌آپی که فقط روی همان سروری
 * باشد که ممکن است بسوزد، در روزِ بد به کار نمی‌آید.
 *
 * از `apiFetch` رد نمی‌شود چون پاسخ فایل باینری است نه JSON.
 */
export async function downloadBackupFile(name: string): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(
    `${apiUrl()}/backups/files/${encodeURIComponent(name)}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );

  if (!res.ok) {
    throw new ApiException(res.status, {
      error: "DOWNLOAD_FAILED",
      message: "دانلود فایل پشتیبان ناموفق بود",
    });
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * بازیابی کلِ دیتابیس از یک فایل بک‌آپ.
 *
 * ⚠️ همه‌ی داده‌ی فعلی جایگزین می‌شود. `confirm` باید دقیقاً «بازیابی» باشد —
 * سرور هم همین را دوباره بررسی می‌کند، این فقط لایه‌ی اول است.
 */
export function restoreBackup(fileName: string, confirm: string): Promise<T.RestoreResult> {
  return apiFetch<T.RestoreResult>("/backups/restore", {
    method: "POST",
    body: { fileName, confirm },
  });
}

// =====================================================
// فاکتور خرید
// =====================================================

/** تأمین‌کننده‌ها — فهرست کوتاه است و صفحه‌بندی ندارد. */
export function getSuppliers(): Promise<T.Supplier[]> {
  return apiFetch<T.Supplier[] | { data?: T.Supplier[] }>("/suppliers").then((r) =>
    Array.isArray(r) ? r : (r.data ?? []),
  );
}

export function createPurchase(body: T.CreatePurchaseInput): Promise<T.Purchase> {
  return apiFetch<T.Purchase>("/purchases", { method: "POST", body });
}

export function getPurchases(p: {
  q?: string;
  supplierId?: string;
  warehouseId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
} = {}) {
  return apiFetch<{ data: T.Purchase[]; meta: T.ReportMeta }>(
    `/purchases?${reportQs(p)}`,
  );
}

export function getPurchase(id: string): Promise<T.Purchase> {
  return apiFetch<T.Purchase>(`/purchases/${encodeURIComponent(id)}`);
}

export function cancelPurchase(id: string, reason: string): Promise<T.Purchase> {
  return apiFetch<T.Purchase>(`/purchases/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: { reason },
  });
}

// =====================================================
// دریافت وجه از بدهکار
// =====================================================

export function createReceipt(body: {
  idempotencyKey?: string;
  customerId: string;
  note?: string;
  /** ثبت مازاد به‌عنوان پیش‌دریافت — فقط بعد از تأیید صریح کاربر. */
  allowOverpayment?: boolean;
  /** سطرهای پرداخت — تسویه‌ی ترکیبی (نقد+کارت+چک) در یک رسید. */
  payments: {
    method: T.PaymentMethod;
    amount: number;
    note?: string;
    cheque?: T.ChequeInput;
  }[];
  /** شکلِ قدیمیِ تک‌روشه — فقط برای سازگاری؛ ترجیحاً از `payments` استفاده کنید. */
  amount?: number;
  method?: T.PaymentMethod;
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
    /** تخفیف ردیف به ریال — سرور آن را از جمع ردیف کم می‌کند. */
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
 * ویرایش پیش‌فاکتور فعال — اقلام، قیمت‌ها و مشتری.
 * ردیف‌ها به‌صورت کامل فرستاده می‌شوند (ردیف‌های قدیمی حذف و دوباره ساخته می‌شوند).
 */
export function updateQuotation(
  id: string,
  body: {
    customerId?: string | null;
    note?: string;
    discount?: number;
    validForMinutes?: number;
    lines: {
      productId: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
    }[];
  }
): Promise<T.Quotation> {
  return apiFetch<T.Quotation>(`/sales/quotations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
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
  payments?: T.PaymentInput[],
  dueDate?: string
): Promise<T.Invoice> {
  return apiFetch<T.Invoice>(`/sales/quotations/${encodeURIComponent(id)}/convert`, {
    method: "POST",
    body: { payments, dueDate },
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
