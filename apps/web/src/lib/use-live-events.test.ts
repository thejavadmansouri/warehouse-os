import { describe, expect, it } from "vitest";

import { KEYS_BY_EVENT } from "./use-live-events";

/**
 * قراردادِ پلِ realtime.
 *
 * هر نوعِ رویدادی که بک‌اند پخش می‌کند باید یا اینجا نگاشتِ هدفمند داشته باشد
 * یا آگاهانه به fallbackِ «همه را تازه کن» واگذار شود. fallback روی یک POS شلوغ
 * همه‌ی کوئری‌های فعال صفحه را refetch می‌کند (حتی جستجوی زنده) — پس نباید
 * بی‌سروصدا برای رویدادهای پرتکرار افتاده باشد.
 *
 * اگر بک‌اند نوعِ جدیدی اضافه کرد، این تست شکست می‌خورد تا نگاشتِ آن آگاهانه
 * تصمیم گرفته شود — نه اینکه سنگینیِ fallback پنهان بماند.
 */

/** همه‌ی انواعِ `RealtimeEventType` بک‌اند (src/realtime/realtime.events.ts). */
const BACKEND_EVENT_TYPES = [
  "sale.created",
  "sale.canceled",
  "stock.changed",
  "receipt.created",
  "payout.created",
  "return.created",
  "correction.created",
  "work-task.progress",
  "open-account.created",
  "open-account.settled",
  "cheque.updated",
  "shortage.created",
  "shortage.updated",
  "online-order.created",
  "online-order.decided",
] as const;

describe("KEYS_BY_EVENT — پل realtime", () => {
  it("همه‌ی رویدادهای بک‌اند نگاشتِ هدفمند دارند — هیچ‌کدام به fallback نمی‌افتند", () => {
    for (const type of BACKEND_EVENT_TYPES) {
      expect(KEYS_BY_EVENT[type], `رویدادِ ${type} باید نگاشت داشته باشد`).toBeDefined();
    }
  });

  it("شکلِ نگاشت سالم است: هر رویداد، فهرستِ کلیدهای غیرخالی", () => {
    for (const [type, keys] of Object.entries(KEYS_BY_EVENT)) {
      expect(keys.length, `${type} نباید نگاشتِ خالی داشته باشد`).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key.length).toBeGreaterThan(0);
        expect(typeof key[0]).toBe("string");
      }
    }
  });

  it("رسید → فهرستِ حساب‌بازها و جدول‌های ریزگردش (F3 و F4) تازه می‌شوند", () => {
    const keys = KEYS_BY_EVENT["receipt.created"];
    for (const prefix of [
      "open-accounts",
      "open-plain-invoices",
      "open-plain-customer",
      "open-account-customer",
      "pos-customer-invoices",
      "pos-customer-balances",
    ]) {
      expect(
        keys.some((k) => k[0] === prefix),
        `receipt.created باید ${prefix} را تازه کند`,
      ).toBe(true);
    }
  });

  it("پرداخت به مشتری → فهرستِ حساب‌بازها و مانده‌ی پرونده‌ها تازه می‌شوند", () => {
    const keys = KEYS_BY_EVENT["payout.created"];
    for (const prefix of [
      "open-accounts",
      "pos-customer-balances",
      "open-plain-customer",
      "open-account-customer",
    ]) {
      expect(
        keys.some((k) => k[0] === prefix),
        `payout.created باید ${prefix} را تازه کند`,
      ).toBe(true);
    }
  });

  it("برگشت و اصلاحیه → پرونده‌ی حسابِ کلی و ریزگردش‌ها تازه می‌شوند", () => {
    for (const type of ["return.created", "correction.created"] as const) {
      const keys = KEYS_BY_EVENT[type];
      for (const prefix of ["open-accounts", "open-account", "open-plain-invoices"]) {
        expect(keys.some((k) => k[0] === prefix)).toBe(true);
      }
    }
  });
});
