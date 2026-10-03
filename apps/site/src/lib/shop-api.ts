// کلاینتِ فروشگاه اینترنتی — فقط endpointهای عمومیِ `/shop/*`.
//
// عمداً از `lib/api` جدا شده چون آن‌جا توکنِ کارکنان را در header می‌گذارد و
// روی ۴۰۱ به `/login` ریدایرکت می‌کند؛ این کلاینت به‌جایش توکنِ مشتری را می‌فرستد
// و روی ۴۰۱ هیچ ریدایرکتی ندارد (فقط خطا پرتاب می‌کند تا UI «وارد شوید» بگوید).
//
// آدرسِ پایه (`apiUrl`) و عکس (`assetUrl`) از همان منبعِ مشترک می‌آیند.
import { apiUrl, assetUrl } from "./api";
import { ApiException } from "./api-error-messages";
import { useShopAuth } from "./shop-auth";
import type {
  OtpRequested,
  OtpVerified,
  ShopBanner,
  ShopCouponPreview,
  ShopFacets,
  ShopMe,
  ShopOrderDetail,
  ShopOrderResult,
  ShopOrderSummary,
  ShopProduct,
  ShopProductDetail,
  ShopProductPage,
  ShopReviews,
  ShopSettings,
  ShopShippingZone,
  StockNotifyResult,
  ReviewWriteResult,
} from "./shop-types";

const REQUEST_TIMEOUT_MS = 30_000;

type ErrorShape = { error?: string; message?: string | string[] };

async function shopRequest<R>(
  path: string,
  init: RequestInit = {}
): Promise<R> {
  const token = useShopAuth.getState().token;
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init.body && typeof init.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${apiUrl()}${path}`, {
      credentials: "include",
      signal: timeout.signal,
      ...init,
      headers,
    });
  } catch (e) {
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const ct = res.headers.get("content-type") ?? "";
  let body: unknown = null;
  if (ct.includes("application/json")) {
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const err = (body ?? {}) as ErrorShape;
    let message = "";
    if (Array.isArray(err.message)) message = err.message.join("؛ ");
    else if (typeof err.message === "string" && err.message.trim()) message = err.message;
    else message = res.status === 429 ? "دفعاتِ زیاد — کمی صبر کنید" : "خطای سرور";
    throw new ApiException(res.status, {
      error: String(err.error ?? `HTTP_${res.status}`),
      message,
    });
  }

  if (res.status === 204) return undefined as R;
  return body as R;
}

// ──────────────────────────── کاتالوگ (عمومی) ────────────────────────────

export function getShopSettings(): Promise<ShopSettings> {
  return shopRequest<ShopSettings>("/shop/settings");
}

export interface ShopCatalogParams {
  q?: string;
  categoryId?: string;
  brandId?: string;
  vehicleModelId?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: "newest" | "cheapest" | "expensive" | "name";
  page?: number;
  pageSize?: number;
}

/** از کاتالوگ، فقط کالاهای لیست‌شده توسط‌سرور را می‌گرفتیم؛ این هیچ‌جا فیلترِ
 *  پنهان ندارد و queryای که نمی‌شناسد نادیده گرفته می‌شود. */
export function getShopProducts(p: ShopCatalogParams = {}): Promise<ShopProductPage> {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.categoryId) qs.set("categoryId", p.categoryId);
  if (p.brandId) qs.set("brandId", p.brandId);
  if (p.vehicleModelId) qs.set("vehicleModelId", p.vehicleModelId);
  if (p.minPrice != null) qs.set("minPrice", String(p.minPrice));
  if (p.maxPrice != null) qs.set("maxPrice", String(p.maxPrice));
  if (p.inStock) qs.set("inStock", "true");
  if (p.sort) qs.set("sort", p.sort);
  if (p.page) qs.set("page", String(p.page));
  if (p.pageSize) qs.set("pageSize", String(p.pageSize));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return shopRequest<ShopProductPage>(`/shop/products${suffix}`);
}

/** قیمت و موجودیِ تازه‌ی یک کالا — برای صفحه‌ی خرید و سبد. */
export function getShopProduct(id: string): Promise<ShopProductDetail> {
  return shopRequest<ShopProductDetail>(`/shop/products/${encodeURIComponent(id)}`);
}

/** فهرستِ ایمنِ چند کالا با id — برای سبد و علاقه‌مندی، در یک درخواست. */
export function getShopProductsByIds(ids: string[]): Promise<ShopProduct[]> {
  if (!ids.length) return Promise.resolve([]);
  const qs = new URLSearchParams({ ids: ids.join(",") });
  return shopRequest<ShopProduct[]>(`/shop/products/by-ids?${qs.toString()}`);
}

export function getShopRelated(id: string): Promise<ShopProduct[]> {
  return shopRequest<ShopProduct[]>(`/shop/products/${encodeURIComponent(id)}/related`);
}

export function getShopReviews(id: string): Promise<ShopReviews> {
  return shopRequest<ShopReviews>(`/shop/products/${encodeURIComponent(id)}/reviews`);
}

export function getShopFacets(): Promise<ShopFacets> {
  return shopRequest<ShopFacets>("/shop/facets");
}

export function getShopBanners(): Promise<ShopBanner[]> {
  return shopRequest<ShopBanner[]>("/shop/banners");
}

export function getShippingZones(): Promise<ShopShippingZone[]> {
  return shopRequest<ShopShippingZone[]>("/shop/shipping-zones");
}

export function notifyStock(id: string, phone: string): Promise<StockNotifyResult> {
  return shopRequest<StockNotifyResult>(`/shop/products/${encodeURIComponent(id)}/notify`, {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export { assetUrl };

// ──────────────────────────── ورود (کد پیامکی) ────────────────────────────

export function requestOtp(phone: string): Promise<OtpRequested> {
  return shopRequest<OtpRequested>("/shop/auth/otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtp(
  phone: string,
  code: string,
  name?: string
): Promise<OtpVerified> {
  return shopRequest<OtpVerified>("/shop/auth/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code, ...(name ? { name } : {}) }),
  });
}

export function getShopMe(): Promise<ShopMe> {
  return shopRequest<ShopMe>("/shop/me");
}

// ──────────────────────────── سفارش (نیازمند ورود) ────────────────────────────

export interface ShopOrderLineInput {
  productId: string;
  quantity: number;
}

export interface CreateShopOrderBody {
  lines: ShopOrderLineInput[];
  receiverName: string;
  receiverPhone: string;
  address: string;
  payMethod?: string;
  note?: string;
  couponCode?: string;
  shippingZoneId?: string;
  idempotencyKey?: string;
}

export function createShopOrder(body: CreateShopOrderBody): Promise<ShopOrderResult> {
  return shopRequest<ShopOrderResult>("/shop/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getShopMyOrders(): Promise<ShopOrderSummary[]> {
  return shopRequest<ShopOrderSummary[]>("/shop/orders");
}

export function getShopOrder(id: string): Promise<ShopOrderDetail> {
  return shopRequest<ShopOrderDetail>(`/shop/orders/${encodeURIComponent(id)}`);
}

export function cancelShopOrder(id: string): Promise<ShopOrderDetail> {
  return shopRequest<ShopOrderDetail>(`/shop/orders/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}

export function couponPreview(
  code: string,
  lines: ShopOrderLineInput[]
): Promise<ShopCouponPreview> {
  return shopRequest<ShopCouponPreview>("/shop/coupon/preview", {
    method: "POST",
    body: JSON.stringify({ code, lines }),
  });
}

// ──────────────────────────── علاقه‌مندی و نظر ────────────────────────────

export function getFavoriteIds(): Promise<string[]> {
  return shopRequest<string[]>("/shop/favorites/ids");
}

export function getShopFavorites(): Promise<ShopProduct[]> {
  return shopRequest<ShopProduct[]>("/shop/favorites");
}

export function addFavorite(productId: string): Promise<unknown> {
  return shopRequest(`/shop/favorites/${encodeURIComponent(productId)}`, { method: "POST" });
}

export function removeFavorite(productId: string): Promise<unknown> {
  return shopRequest(`/shop/favorites/${encodeURIComponent(productId)}`, { method: "DELETE" });
}

export function writeReview(
  productId: string,
  body: { rating: number; title?: string; review: string }
): Promise<ReviewWriteResult> {
  return shopRequest<ReviewWriteResult>(
    `/shop/products/${encodeURIComponent(productId)}/reviews`,
    { method: "POST", body: JSON.stringify(body) }
  );
}