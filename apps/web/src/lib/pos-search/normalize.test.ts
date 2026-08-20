import { describe, it, expect } from "vitest";

import { normalizeWithMap } from "./normalize";

/**
 * Verifies the invariant highlighting depends on: for every character in
 * `normalized`, slicing the ORIGINAL string at [map[i], map[i]+1) must land on
 * the character that actually produced it (letter-swap / digit-swap cases),
 * or at least a defensible position for removed/collapsed characters.
 */
function assertMapIsSound(original: string, normalized: string, map: number[]) {
  expect(map.length).toBe(normalized.length);
  for (const idx of map) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(original.length || 1);
  }
  // map must be non-decreasing — normalization never reorders characters.
  for (let i = 1; i < map.length; i++) {
    expect(map[i]).toBeGreaterThanOrEqual(map[i - 1]);
  }
}

describe("normalizeWithMap", () => {
  it("maps a plain Persian word 1:1", () => {
    const { normalized, map } = normalizeWithMap("پراید");
    expect(normalized).toBe("پراید");
    assertMapIsSound("پراید", normalized, map);
    // every char maps to itself here (no substitutions)
    expect(map).toEqual([0, 1, 2, 3, 4]);
  });

  it("maps Arabic-letter substitutions back to the original letter position", () => {
    const original = "كيك"; // ك ي ك -> ک ی ک
    const { normalized, map } = normalizeWithMap(original);
    expect(normalized).toBe("کیک");
    assertMapIsSound(original, normalized, map);
    expect(map).toEqual([0, 1, 2]);
  });

  it("maps Persian digits back to their original position", () => {
    const original = "کد۱۲۳";
    const { normalized, map } = normalizeWithMap(original);
    expect(normalized).toBe("کد123");
    assertMapIsSound(original, normalized, map);
    // slicing the original at each mapped index recovers the digit that produced it
    expect(original[map[2]]).toBe("۱");
    expect(original[map[3]]).toBe("۲");
    expect(original[map[4]]).toBe("۳");
  });

  it("drops tashkil without leaving a gap in the map", () => {
    const original = "لَنت"; // fatha (tashkil) after ل
    const { normalized, map } = normalizeWithMap(original);
    expect(normalized).toBe("لنت");
    assertMapIsSound(original, normalized, map);
  });

  it("turns ZWNJ into a space and keeps the map sound", () => {
    const original = "نیم‌فاصله";
    const { normalized, map } = normalizeWithMap(original);
    expect(normalized).toBe("نیم فاصله");
    assertMapIsSound(original, normalized, map);
  });

  it("collapses whitespace runs and keeps a valid single map entry", () => {
    const original = "a    b";
    const { normalized, map } = normalizeWithMap(original);
    expect(normalized).toBe("a b");
    assertMapIsSound(original, normalized, map);
  });

  it("trims leading/trailing whitespace consistently with normalizePersian", () => {
    const original = "  پراید  ";
    const { normalized, map } = normalizeWithMap(original);
    expect(normalized).toBe("پراید");
    assertMapIsSound(original, normalized, map);
    expect(original[map[0]]).toBe("پ");
  });

  it("round-trips: slicing the original at [map[i], map[i]+1) is always in-bounds", () => {
    const samples = [
      "لنت جلو پراید ۱۲۳",
      "كيك مدينة",
      "  فاصله‌ی نیم   چندتایی  ",
      "Textar تکستار",
      "",
    ];
    for (const s of samples) {
      const { normalized, map } = normalizeWithMap(s);
      assertMapIsSound(s, normalized, map);
    }
  });

  it("handles empty and null input", () => {
    expect(normalizeWithMap("")).toEqual({ normalized: "", map: [] });
    expect(normalizeWithMap(null)).toEqual({ normalized: "", map: [] });
  });
});
