import { describe, expect, it } from "vitest";

import { computeCreditDueDate, CREDIT_TERMS } from "./credit-terms-panel";

describe("computeCreditDueDate", () => {
  it("adds credit days when no custom date", () => {
    const due = computeCreditDueDate(7, "", null);
    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    expected.setHours(23, 59, 59, 999);
    expect(due.toDateString()).toBe(expected.toDateString());
    expect(due.getHours()).toBe(23);
  });

  it("uses customer credit days when creditDays is null", () => {
    const due = computeCreditDueDate(null, "", 30);
    const expected = new Date();
    expected.setDate(expected.getDate() + 30);
    expect(due.toDateString()).toBe(expected.toDateString());
  });

  it("prefers custom ISO date over day chips", () => {
    const due = computeCreditDueDate(90, "2026-12-01", 7);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(11);
    expect(due.getDate()).toBe(1);
    expect(due.getHours()).toBe(23);
  });

  it("exports shared credit terms including same-day", () => {
    expect(CREDIT_TERMS[0]).toBe(0);
    expect(CREDIT_TERMS).toContain(30);
  });
});
