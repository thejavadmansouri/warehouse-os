import { describe, expect, it } from "vitest";

import { COMMANDS } from "./commands";

/** رویدادِ کیبورد با چیدمانِ دلخواه. */
const ev = (over: Partial<KeyboardEvent>) =>
  ({ key: "", code: "", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...over }) as KeyboardEvent;

const match = (id: string, e: KeyboardEvent) =>
  COMMANDS.find((c) => c.id === id)!.match(e);

describe("میانبرهای حرفی مستقل از چیدمانِ صفحه‌کلید", () => {
  it("Alt+N روی چیدمان انگلیسی فرمانِ «سند نو» را می‌زند", () => {
    expect(match("new", ev({ altKey: true, key: "n", code: "KeyN" }))).toBe(true);
  });

  it("REGRESSION: Alt+N روی چیدمان فارسی هم می‌زند (e.key = «ن»)", () => {
    // دقیقاً همان چیزی که روی ویندوزِ فروشگاه اتفاق می‌افتاد و میانبر را می‌کشت.
    expect(match("new", ev({ altKey: true, key: "ن", code: "KeyN" }))).toBe(true);
  });

  it("REGRESSION: بقیه‌ی میانبرهای حرفی هم روی چیدمان فارسی کار می‌کنند", () => {
    expect(match("quotes", ev({ altKey: true, key: "ض", code: "KeyQ" }))).toBe(true);
    expect(match("workTasks", ev({ altKey: true, key: "ی", code: "KeyW" }))).toBe(true);
    expect(match("addProduct", ev({ altKey: true, key: "ش", code: "KeyA" }))).toBe(true);
    expect(match("shortage", ev({ altKey: true, key: "س", code: "KeyS" }))).toBe(true);
    expect(match("kardex", ev({ altKey: true, key: "ن", code: "KeyK" }))).toBe(true);
    expect(match("find", ev({ ctrlKey: true, key: "ب", code: "KeyF" }))).toBe(true);
  });

  it("صفحه‌کلیدِ بدونِ code (مجازی) از راهِ e.key کار می‌کند", () => {
    expect(match("new", ev({ altKey: true, key: "n", code: "" }))).toBe(true);
  });

  it("کلیدِ اشتباه نباید بگیرد", () => {
    expect(match("new", ev({ altKey: true, key: "m", code: "KeyM" }))).toBe(false);
    // بدون Alt هم نباید بگیرد — وگرنه تایپِ ساده‌ی «n» سند نو می‌ساخت.
    expect(match("new", ev({ key: "n", code: "KeyN" }))).toBe(false);
  });

  it("Ctrl+P چاپ است و Ctrl+Shift+P پیش‌نمایش — روی فارسی هم از هم جدا می‌مانند", () => {
    expect(match("print", ev({ ctrlKey: true, key: "پ", code: "KeyP" }))).toBe(true);
    expect(match("print", ev({ ctrlKey: true, shiftKey: true, key: "پ", code: "KeyP" }))).toBe(false);
    expect(match("preview", ev({ ctrlKey: true, shiftKey: true, key: "پ", code: "KeyP" }))).toBe(true);
  });
});
