// کلاینتِ مرکزیِ اپِ سایت — فقط با APIِ سایت (APP_ROLE=site) حرف می‌زند.
//
// این اپ عمداً از پنلِ انبار جدا شده: هیچ endpointی از ماژول‌های انبار (POS،
// موجودی، کاربران، …) اینجا نیست و نباید هم باشد. کلاینتِ فروشگاهِ عمومی
// (`shop-api.ts`) جدا است و توکنِ مشتری را می‌فرستد؛ این فایل توکنِ کارمندِ
// سایت (مدیرِ سایت) را می‌فرستد و فقط برای پنلِ مدیریتِ محتوای سایت است.
import { useSiteAuthStore } from "./auth-store";
import { ApiException } from "./api-error-messages";
import type { ApiErrorBody } from "./types";
import * as T from "./types";

/**
 * پورتی که APIِ سایت روی آن گوش می‌دهد.
 *
 * در نصبِ دوماشینه، APIِ سایت (با APP_ROLE=site) روی VPS اجرا می‌شود — نه روی
 * سرورِ انبار. مقدارِ پیش‌فرض همان ۳۰۰۰ است تا نصبِ تک‌ماشینه‌ی dev هم درست
 * کار کند.
 */
const SITE_API_PORT = process.env.NEXT_PUBLIC_SITE_API_PORT ?? "3000";

function resolveSiteApiUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${SITE_API_PORT}`;
  }
  return `http://127.0.0.1:${SITE_API_PORT}`;
}

/** آدرسِ پایه‌ی APIِ سایت — تابع است، نه ثابت (دلیلش مثل پنلِ انبار است). */
export function apiUrl(): string {
  return resolveSiteApiUrl();
}

/** آدرسِ کاملِ فایل (بنر، …) — برای داده‌هایی که خودِ سایت آپلود کرده. */
export function assetUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${apiUrl()}${path}`;
  return `${apiUrl()}/${path}`;
}

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

function toErrorBody(parsed: unknown, status: number): ApiErrorBody {
  const fallback = { error: `HTTP_${status}`, message: defaultStatusMessage(status) };

  if (typeof parsed === "string" && parsed.trim()) {
    return { ...fallback, message: parsed };
  }

  if (parsed && typeof parsed === "object") {
    const body = parsed as Partial<ApiErrorBody>;
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

const REQUEST_TIMEOUT_MS = 30_000;

/** fetch پایین‌سطحی — بدون توکن، بدون redirect. */
async function rawFetch<R>(path: string, init: ApiRequestInit = {}): Promise<R> {
  let res: Response;

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);

  try {
    res = await fetch(`${apiUrl()}${path}`, {
      credentials: "include",
      ...buildInit(init),
      signal: timeout.signal,
    });
  } catch (e) {
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ApiException(res.status, toErrorBody(await parseJson(res), res.status));
  }

  if (res.status === 204) return undefined as R;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined as R;
  return (await res.json()) as R;
}

/** fetch احراز‌شده — توکنِ مدیرِ سایت را می‌فرستد؛ روی ۴۰۱ به لاگینِ سایت می‌رود. */
async function apiFetch<R>(path: string, init: ApiRequestInit = {}): Promise<R> {
  const token = useSiteAuthStore.getState().token;
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    return await rawFetch<R>(path, { ...init, headers });
  } catch (e) {
    if (e instanceof ApiException && e.status === 401) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin/login")) {
        useSiteAuthStore.getState().logout();
        window.location.href = "/admin/login";
      }
    }
    throw e;
  }
}

// =====================================================
// احراز هویتِ مدیرِ سایت
// =====================================================

/** POST /auth/login — همان endpointِ مشترک؛ روی دیتابیسِ سایت، کاربرِ مدیرِ سایت است. */
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

/** GET /auth/me */
export function getMe(): Promise<T.AuthMeResponse> {
  return apiFetch<T.AuthMeResponse>("/auth/me");
}

/** POST /auth/logout */
export function logoutServer(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/auth/logout", { method: "POST" });
}

// =====================================================
// مدیریتِ محتوای سایت
// =====================================================

// ----- کوپن -----

export function listCoupons(): Promise<T.Coupon[]> {
  return apiFetch<T.Coupon[]>("/coupons");
}

export function createCoupon(dto: T.CreateCouponDto): Promise<T.Coupon> {
  return apiFetch<T.Coupon>("/coupons", { method: "POST", body: dto });
}

export function updateCoupon(id: string, dto: T.UpdateCouponDto): Promise<T.Coupon> {
  return apiFetch<T.Coupon>(`/coupons/${encodeURIComponent(id)}`, { method: "PATCH", body: dto });
}

export function deleteCoupon(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/coupons/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ----- بنر -----

export function listBanners(): Promise<T.Banner[]> {
  return apiFetch<T.Banner[]>("/banners");
}

export function createBanner(file: File, dto: T.BannerMetaDto): Promise<T.Banner> {
  const fd = new FormData();
  fd.append("file", file);
  appendBannerMeta(fd, dto);
  return apiFetch<T.Banner>("/banners", { method: "POST", body: fd });
}

export function updateBanner(id: string, dto: T.BannerMetaDto): Promise<T.Banner> {
  return apiFetch<T.Banner>(`/banners/${encodeURIComponent(id)}`, { method: "PATCH", body: dto });
}

export function replaceBannerImage(id: string, file: File): Promise<T.Banner> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<T.Banner>(`/banners/${encodeURIComponent(id)}/image`, { method: "POST", body: fd });
}

export function deleteBanner(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/banners/${encodeURIComponent(id)}`, { method: "DELETE" });
}

function appendBannerMeta(fd: FormData, dto: T.BannerMetaDto) {
  if (dto.title != null) fd.append("title", String(dto.title));
  if (dto.linkUrl != null) fd.append("linkUrl", dto.linkUrl);
  if (dto.sortOrder != null) fd.append("sortOrder", String(dto.sortOrder));
  if (dto.isActive != null) fd.append("isActive", String(dto.isActive));
  if (dto.startsAt) fd.append("startsAt", dto.startsAt);
  if (dto.endsAt) fd.append("endsAt", dto.endsAt);
}

// ----- نظرات -----

export function listPendingReviews(): Promise<T.PendingReview[]> {
  return apiFetch<T.PendingReview[]>("/review-moderation/pending");
}

export function approveReview(id: string): Promise<{ ok: boolean; status: string }> {
  return apiFetch(`/review-moderation/${encodeURIComponent(id)}/approve`, { method: "POST", body: {} });
}

export function rejectReview(id: string): Promise<{ ok: boolean; status: string }> {
  return apiFetch(`/review-moderation/${encodeURIComponent(id)}/reject`, { method: "POST", body: {} });
}

// ----- مناطق ارسال -----

export function listShippingZones(): Promise<T.ShippingZone[]> {
  return apiFetch<T.ShippingZone[]>("/shipping-zones");
}

export function createShippingZone(dto: T.CreateShippingZoneDto): Promise<T.ShippingZone> {
  return apiFetch<T.ShippingZone>("/shipping-zones", { method: "POST", body: dto });
}

export function updateShippingZone(id: string, dto: T.UpdateShippingZoneDto): Promise<T.ShippingZone> {
  return apiFetch<T.ShippingZone>(`/shipping-zones/${encodeURIComponent(id)}`, { method: "PATCH", body: dto });
}

export function deleteShippingZone(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/shipping-zones/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ----- اعلانِ موجودی -----

export function listPendingStockNotifies(): Promise<T.PendingStockNotify[]> {
  return apiFetch<T.PendingStockNotify[]>("/stock-notify/pending");
}

export function sendStockNotify(productId: string): Promise<{ ok: boolean; sent: number }> {
  return apiFetch(`/stock-notify/${encodeURIComponent(productId)}/send`, { method: "POST", body: {} });
}

// =====================================================
// گزارشِ فقط‌خواندنیِ سفارش‌ها — مدیرِ سایت می‌بیند، تحویل‌دادن کارِ انبار است
// =====================================================

export interface SiteAdminOrderSummary {
  id: string;
  number: number;
  status: T.OnlineOrderStatus;
  total: number;
  payMethod: string;
  receiverName: string;
  receiverPhone: string;
  createdAt: string;
  deliveredToShop: boolean;
  lineCount: number;
}

export interface SiteAdminOrdersPage {
  items: SiteAdminOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /site-admin/orders — صفِ سفارش‌های سایت، فقط‌خواندنی. */
export function listSiteOrders(params: {
  status?: T.OnlineOrderStatus;
  q?: string;
  page?: number;
} = {}): Promise<SiteAdminOrdersPage> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<SiteAdminOrdersPage>(`/site-admin/orders${suffix}`);
}

/** GET /site-admin/overview — اعدادِ امروز برای صفحه‌ی اولِ پنلِ سایت. */
export function getSiteOverview(): Promise<{
  ordersToday: number;
  salesToday: number;
  inFlight: number;
  customers: number;
  onlineProducts: number;
}> {
  return apiFetch("/site-admin/overview");
}
