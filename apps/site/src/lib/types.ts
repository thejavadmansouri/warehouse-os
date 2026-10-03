// تایپ‌های موردنیازِ اپِ سایت — فقط بخشِ سایت؛ هیچ تایپی از انبار (POS، موجودی، …)
// اینجا نیست چون این اپ به آن‌ها دسترسی هم ندارد.

export type Role = "ADMIN" | "MANAGER" | "STAFF" | "SALES";

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  /** دسترسی به بخش «فروشگاه اینترنتی» — روی APIِ سایت، مدیرِ سایت داردش. */
  canManageSite?: boolean;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface AuthMeResponse {
  sub: string;
  username: string;
  role: Role;
  fullName?: string;
  id?: string;
  canManageSite?: boolean;
}

export interface ApiErrorBody {
  error: string;
  message?: string | string[];
  available?: number;
  [key: string]: unknown;
}

// =====================================================
// فروشگاه اینترنتی — مدیریتِ محتوا
// =====================================================

export type OnlineOrderStatus =
  | "PLACED"
  | "PREPARING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export type CouponType = "PERCENT" | "FIXED";

/** یک کوپن تخفیفِ سایت. مبالغ به ریال (واحدِ ذخیره). */
export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomer: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateCouponDto {
  code: string;
  type: CouponType;
  value: number;
  minSubtotal?: number;
  maxDiscount?: number;
  usageLimit?: number;
  perCustomer?: number;
  startsAt?: string;
  expiresAt?: string;
  isActive?: boolean;
}

export type UpdateCouponDto = Partial<Omit<CreateCouponDto, "code" | "type">>;

/** یک بنرِ صفحه‌ی اولِ سایت. */
export interface Banner {
  id: string;
  title: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface BannerMetaDto {
  title?: string;
  linkUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
  startsAt?: string;
  endsAt?: string;
}

/** یک نظرِ در انتظارِ تأیید. */
export interface PendingReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string;
  product: { id: string; name: string; sku: string };
  siteCustomer: { firstName: string; lastName: string; phone: string } | null;
}

/** یک منطقه‌ی ارسال با هزینه‌ی خودش. */
export interface ShippingZone {
  id: string;
  name: string;
  fee: number;
  freeOver: number | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface CreateShippingZoneDto {
  name: string;
  fee: number;
  freeOver?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateShippingZoneDto = Partial<CreateShippingZoneDto>;

/** کالایی که کسی منتظرِ موجودِشدنش است. */
export interface PendingStockNotify {
  productId: string;
  name: string;
  sku: string;
  waiting: number;
}
