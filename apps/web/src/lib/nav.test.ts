import { describe, expect, it } from "vitest";

import {
  NAV_SECTIONS,
  filterNavByRole,
  landingPathForRole,
  type NavItem,
  type NavSection,
} from "./nav";
import type { Role } from "./types";

const ROLES: Role[] = ["ADMIN", "MANAGER", "SALES", "STAFF"];

/** همه‌ی برگ‌های یک بخش — هاب‌ها خودشان مقصد نیستند. */
function leaves(sections: NavSection[]): NavItem[] {
  const out: NavItem[] = [];
  const walk = (items: NavItem[]) => {
    for (const it of items) {
      if (it.children) walk(it.children);
      else out.push(it);
    }
  };
  sections.forEach((s) => walk(s.items));
  return out;
}

function pinnedOf(sections: NavSection[]): NavItem[] {
  return sections.find((s) => s.pinned)?.items ?? [];
}

describe("ساختار منو", () => {
  it("هر نقش دستِ‌کم یک میان‌برِ سنجاق‌شده دارد", () => {
    // اگر بخشِ سنجاق‌شده برای نقشی خالی شود، همه‌ی کارش می‌رود زیر «بیشتر» و
    // منو برای او یعنی یک دکمه‌ی تنها.
    for (const role of ROLES) {
      const pinned = pinnedOf(filterNavByRole(NAV_SECTIONS, role));
      expect(pinned.length, `نقش ${role}`).toBeGreaterThan(0);
    }
  });

  it("کارهای هرروزه‌ی فروش بالا سنجاق‌اند", () => {
    const pinned = pinnedOf(filterNavByRole(NAV_SECTIONS, "SALES")).map((i) => i.href);
    expect(pinned).toContain("/admin/pos");
    expect(pinned).toContain("/admin/customers");
    expect(pinned).toContain("/admin/invoices");
    // گزارش برای فروشنده نیست.
    expect(pinned).not.toContain("/admin/reports");
  });

  it("انباردار میان‌برهای خودش را می‌بیند، نه صندوق را", () => {
    const pinned = pinnedOf(filterNavByRole(NAV_SECTIONS, "STAFF")).map((i) => i.href);
    expect(pinned).toContain("/admin/inventory");
    expect(pinned).not.toContain("/admin/pos");
  });

  it("مدیر گزارش‌ها را بالا دارد", () => {
    const pinned = pinnedOf(filterNavByRole(NAV_SECTIONS, "MANAGER")).map((i) => i.href);
    expect(pinned).toContain("/admin/reports");
  });

  it("هیچ صفحه‌ای برای یک نقش دو بار در منو نمی‌آید", () => {
    /*
     * تکرارِ یک مقصد در دو جای منو یعنی کاربر نمی‌داند کدام «خانه»‌ی آن صفحه
     * است — و وقتی میان‌برِ سنجاق‌شده اضافه شد، دقیقاً همین خطر پیش آمد.
     */
    for (const role of ROLES) {
      const hrefs = leaves(filterNavByRole(NAV_SECTIONS, role))
        .map((i) => i.href)
        .filter((h): h is string => !!h);
      const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
      expect(dupes, `نقش ${role}`).toEqual([]);
    }
  });

  it("هر برگ مقصد دارد و هر هاب فرزند", () => {
    const walk = (items: NavItem[]) => {
      for (const it of items) {
        if (it.children) expect(it.children.length, it.title).toBeGreaterThan(0);
        else expect(it.href, it.title).toBeTruthy();
      }
    };
    NAV_SECTIONS.forEach((s) => walk(s.items));
  });

  it("منوی سطحِ اول کوتاه می‌ماند", () => {
    // چهار میان‌بر + «بیشتر». اگر روزی پنجمی اضافه شد، این تست عمداً می‌شکند تا
    // تصمیمش آگاهانه باشد، نه با اضافه‌کردنِ بی‌صدای یک ردیف.
    const sections = filterNavByRole(NAV_SECTIONS, "ADMIN");
    expect(pinnedOf(sections)).toHaveLength(4);
    expect(sections.filter((s) => !s.pinned)).toHaveLength(1);
  });

  it("فروشنده و مدیر مستقیم پشتِ صندوق فرود می‌آیند", () => {
    expect(landingPathForRole("SALES")).toBe("/admin/pos");
    expect(landingPathForRole("ADMIN")).toBe("/admin/pos");
    expect(landingPathForRole("STAFF")).toBe("/admin/inventory");
  });
});
