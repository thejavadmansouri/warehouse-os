// طبق بخش ۵ سند — نگاشت کدهای خطای بک‌اند به پیام فارسی قابل‌فهم
import type { ApiErrorBody } from "./types";

const ERROR_MESSAGES: Record<string, (body: ApiErrorBody) => string> = {
  INSUFFICIENT_STOCK: (b) =>
    b.available != null
      ? `موجودی کافی نیست (موجودی فعلی: ${b.available})`
      : "موجودی کافی نیست",
  SESSION_NOT_FOUND: () =>
    "سشن انبارگردانی معتبر نیست، اول باید سشن شروع بشه",
  INVALID_QUANTITY: () => "تعداد وارد شده نامعتبر است",
  DESTINATION_REQUIRED: () => "مقصد انتقال مشخص نشده",
  INVALID_TARGET_QUANTITY: () => "مقدار هدف نامعتبر است",
};

export function resolveApiError(body: ApiErrorBody): string {
  const fn = ERROR_MESSAGES[body.error];
  if (fn) return fn(body);
  if (body.message) return body.message;
  return "خطای غیرمنتظره";
}

// خطایی که از fetch پرتاب می‌شود (شامل کد + پیام)
export class ApiException extends Error {
  code: string;
  status: number;
  available?: number;
  raw: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(resolveApiError(body));
    this.name = "ApiException";
    this.status = status;
    this.code = body.error;
    this.available = body.available;
    this.raw = body;
  }
}
