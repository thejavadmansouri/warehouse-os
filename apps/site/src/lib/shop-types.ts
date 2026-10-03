// تایپ‌های پاسخِ endpointهای عمومیِ فروشگاه اینترنتی (`/shop/*`).
//
// این تایپ‌ها مستقل از تایپ‌های پنل هستند و دقیقاً شکلِ پاسخِ سرویس‌های
// `StorefrontCatalogService` و دوستان را می‌گویند. عمداً جا به جا دستی نوشته
// شده‌اند تا اگر سرور فیلدی حذف/اضافه کرد، هیچ‌جا بی‌صدا درونگدازی نشود.

export type CurrencyUnit = "RIAL" | "TOMAN";

/** وضعیتِ موجودیِ نمایشیِ کاتالوگ — عمداً عددِ دقیق نیست. */
export type ShopStockBand = "IN" | "LOW" | "OUT";

/** GET /shop/settings */
export interface ShopSettings {
  enabled: boolean;
  name: string;
  phone: string | null;
  address: string | null;
  cardNumber: string | null;
  cardHolder: string | null;
  footer: string | null;
  /** هزینه ارسال به واحدِ سایت (صفر = رایگان نیست، قاعده خاموش). */
  shippingFee: number;
  /** بالای این سقف ارسال رایگان می‌شود. صفر یعنی قاعده خاموش. */
  freeShipOver: number;
  /** برچسبی که کنار هر قیمت چاپ می‌شود — واحدِ نمایشِ سایت. */
  unit: CurrencyUnit;
  /** کالای بی‌قیمت «تماس بگیرید» نشان داده می‌شود؟ */
  showUnpriced: boolean;
  storedUnit: CurrencyUnit;
}

/** کارتِ کاتالوگ (لیست، مرتبط، علاقه‌مندی). */
export interface ShopProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  partNumber: string | null;
  brand: string | null;
  brandId: string | null;
  category: string | null;
  categoryId: string | null;
  /** قیمت به واحدِ سایت. null یعنی «تماس بگیرید». */
  price: number | null;
  /** قیمت پیش از تخفیف؛ null یعنی تخفیفی نیست. */
  compareAt: number | null;
  stock: ShopStockBand;
  image: string | null;
}

/** GET /shop/products */
export interface ShopProductPage {
  items: ShopProduct[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

/** GET /shop/products/:id */
export interface ShopProductDetail extends ShopProduct {
  description: string | null;
  weight: number | null;
  vehicles: string[];
  images: string[];
}

/** GET /shop/facets */
export interface ShopFacetItem {
  id: string;
  name: string;
  count: number;
}
export interface ShopVehicleFacet extends ShopFacetItem {
  startYear: number | null;
  endYear: number | null;
}
export interface ShopFacets {
  categories: ShopFacetItem[];
  brands: ShopFacetItem[];
  vehicles: ShopVehicleFacet[];
}

/** GET /shop/banners */
export interface ShopBanner {
  id: string;
  title: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
}

/** GET /shop/shipping-zones */
export interface ShopShippingZone {
  id: string;
  name: string;
  fee: number;
  freeOver: number | null;
}

/** POST /shop/auth/otp */
export interface OtpRequested {
  sent: boolean;
  expiresInSeconds: number;
  /** فقط در حالت توسعه/لاگ‌کنسول — در production نیست. */
  devCode?: string;
}

/** POST /shop/auth/verify */
export interface OtpVerified {
  token: string;
  customer: { id: string; firstName: string; lastName: string | null; phone: string };
}

/** GET /shop/me */
export interface ShopMe {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  addresses: unknown[];
}

/** GET /shop/products/:id/reviews */
export interface ShopReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verified: boolean;
  createdAt: string;
  author: string;
}
export interface ShopReviews {
  average: number;
  count: number;
  items: ShopReview[];
}

/** POST /shop/products/:id/notify */
export interface StockNotifyResult {
  ok: boolean;
  message: string;
}

/** POST /shop/products/:id/reviews */
export interface ReviewWriteResult {
  ok: boolean;
  status: "APPROVED" | "PENDING";
  verified: boolean;
  message: string;
}

/** GET /shop/orders */
export interface ShopOrderSummary {
  id: string;
  number: number;
  status: string;
  total: number;
  payMethod: string;
  createdAt: string;
  lineCount: number;
}

/** GET /shop/orders/:id */
export interface ShopOrderLine {
  productId: string;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
export interface ShopOrderDetail {
  id: string;
  number: number;
  status: string;
  subtotal: number;
  shippingFee: number;
  discount: number;
  couponCode: string | null;
  total: number;
  payMethod: string;
  receiverName: string;
  receiverPhone: string;
  address: string;
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  lines: ShopOrderLine[];
}

/** POST /shop/orders */ export type ShopOrderResult = ShopOrderDetail;
/** POST /shop/coupon/preview */
export interface ShopCouponPreview {
  ok: boolean;
  message: string;
  couponId?: string;
  code?: string;
  discount?: number;
  type?: "PERCENT" | "FIXED";
  value?: number;
  subtotal: number;
}