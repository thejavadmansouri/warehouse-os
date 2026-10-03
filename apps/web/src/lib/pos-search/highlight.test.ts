import { describe, it, expect } from "vitest";

import { highlightMatches } from "./highlight";

/** Segments must always reconstruct the original (NFC) text exactly. */
function joined(segments: { text: string }[]): string {
  return segments.map((s) => s.text).join("");
}

describe("highlightMatches", () => {
  it("returns one unmatched segment when there are no tokens", () => {
    expect(highlightMatches("لنت جلو پراید", [])).toEqual([
      { text: "لنت جلو پراید", matched: false },
    ]);
  });

  it("returns one unmatched segment when nothing matches", () => {
    const segs = highlightMatches("لنت جلو پراید", ["دیسک"]);
    expect(segs).toEqual([{ text: "لنت جلو پراید", matched: false }]);
  });

  it("highlights a single matched word", () => {
    const segs = highlightMatches("لنت جلو پراید", ["پراید"]);
    expect(joined(segs)).toBe("لنت جلو پراید");
    expect(segs).toEqual([
      { text: "لنت جلو ", matched: false },
      { text: "پراید", matched: true },
    ]);
  });

  it("highlights multiple separate matched words", () => {
    const segs = highlightMatches("لنت جلو پراید", ["لنت", "پراید"]);
    expect(joined(segs)).toBe("لنت جلو پراید");
    expect(segs.filter((s) => s.matched).map((s) => s.text)).toEqual(["لنت", "پراید"]);
  });

  it("highlights a substring match, not just whole-word", () => {
    // query token "پرا" should highlight only that prefix inside "پراید"
    const segs = highlightMatches("لنت جلو پراید", ["پرا"]);
    expect(joined(segs)).toBe("لنت جلو پراید");
    const hit = segs.find((s) => s.matched);
    expect(hit?.text).toBe("پرا");
  });

  it("merges overlapping/adjacent matches instead of double-highlighting", () => {
    // "پراید" and "راید" both match inside "پراید" and overlap
    const segs = highlightMatches("پراید", ["پراید", "راید"]);
    expect(joined(segs)).toBe("پراید");
    expect(segs).toEqual([{ text: "پراید", matched: true }]);
  });

  it("is normalization-aware: matches an Arabic-letter variant in the stored name", () => {
    // stored name has ك/ي (Arabic), query token is typed with ک/ی (Persian)
    const segs = highlightMatches("كيك ویژه", ["کیک"]);
    expect(joined(segs)).toBe("كيك ویژه");
    const hit = segs.find((s) => s.matched);
    expect(hit?.text).toBe("كيك"); // highlights the ORIGINAL (unconverted) substring
  });

  it("is normalization-aware: matches through Persian digits", () => {
    const segs = highlightMatches("پژو ۴۰۵", ["405"]);
    const hit = segs.find((s) => s.matched);
    expect(hit?.text).toBe("۴۰۵");
  });

  it("always reconstructs the exact original text for a variety of names", () => {
    const cases: [string, string[]][] = [
      ["لنت جلو پراید مدل ۲۰۱۹", ["لنت", "۲۰۱۹"]],
      ["فیلتر روغن پراید (اصلی)", ["روغن"]],
      ["  فاصله‌ی نیم چندتایی  ", ["نیم"]],
      ["Textar تکستار", ["textar"]],
    ];
    for (const [text, tokens] of cases) {
      const segs = highlightMatches(text, tokens);
      expect(joined(segs)).toBe(text.normalize("NFC"));
    }
  });

  it("handles an empty text gracefully", () => {
    expect(highlightMatches("", ["پراید"])).toEqual([{ text: "", matched: false }]);
  });
});
