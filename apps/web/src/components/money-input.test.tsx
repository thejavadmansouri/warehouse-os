import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";

import { MoneyInput } from "./money-input";

afterEach(() => cleanup());

/** کنترلشده با state واقعی تا «نمایشِ زنده» هم در تست دیده شود. */
function Harness({ initial = 0 }: { initial?: number }) {
  const [v, setV] = React.useState(initial);
  return <MoneyInput value={v} onChange={setV} aria-label="مبلغ" />;
}

const getInput = () => screen.getByRole<HTMLInputElement>("textbox");

/** صبر برای requestAnimationFrameِ روندِ مکان‌نما. */
const flushRaf = () => new Promise((r) => setTimeout(r, 25));

describe("MoneyInput", () => {
  it("مبلغ را همان لحظه با ارقام فارسی و جداکننده‌ی «٬» نشان می‌دهد", () => {
    render(<MoneyInput value={12500} onChange={() => {}} />);
    expect(getInput().value).toBe("۱۲٬۵۰۰");
  });

  it("وقتی مقدار صفر است خالی است (و placeholder دیده می‌شود)", () => {
    render(<Harness />);
    expect(getInput().value).toBe("");
  });

  it("تایپ ارقام انگلیسی → عدد خالص در onChange و نمایشِ فارسیِ زنده", () => {
    render(<Harness />);
    fireEvent.change(getInput(), { target: { value: "12500" } });
    expect(getInput().value).toBe("۱۲٬۵۰۰");
  });

  it("ارقام فارسیِ تایپ‌شده هم پذیرفته می‌شود", () => {
    render(<Harness />);
    fireEvent.change(getInput(), { target: { value: "۲۵۰۰۰" } });
    expect(getInput().value).toBe("۲۵٬۰۰۰");
  });

  it("جداکننده‌ی تایپ‌شده (٬ یا ,) مزاحم نمی‌شود", () => {
    render(<Harness />);
    fireEvent.change(getInput(), { target: { value: "12,500" } });
    expect(getInput().value).toBe("۱۲٬۵۰۰");
  });

  it("پاک کردن → onChange(0) و خالی شدن فیلد", () => {
    render(<Harness initial={5000} />);
    fireEvent.change(getInput(), { target: { value: "" } });
    expect(getInput().value).toBe("");
  });

  it("مکان‌نما بعد از تایپ در انتهای عدد می‌ماند — نه جلوی جداکننده", async () => {
    render(<Harness />);
    fireEvent.change(getInput(), {
      target: { value: "12500", selectionStart: 5, selectionEnd: 5 },
    });
    await flushRaf();
    expect(getInput().value).toBe("۱۲٬۵۰۰");
    // انتهای رشته‌ی «۱۲٬۵۰۰» — جداکننده مکان‌نما را جلوتر/عقب‌تر نمی‌برد.
    expect(getInput().selectionStart).toBe(6);
  });

  it("ویرایش رقمِ وسط: مکان‌نما بعد از همان تعداد رقم می‌نشیند", async () => {
    render(<Harness initial={12500} />);
    // در «۱۲۴۰۰»، جایگاه ۴ یعنی مکان‌نما بعد از چهار رقمِ «۱۲۴۰».
    fireEvent.change(getInput(), {
      target: { value: "۱۲۴۰۰", selectionStart: 4, selectionEnd: 4 },
    });
    await flushRaf();
    expect(getInput().value).toBe("۱۲٬۴۰۰");
    // بعد از همان چهار رقم در نمایشِ جدید: ۱، ۲، ٬، ۴، ۰ → جایگاه ۵.
    // جداکننده رقم نیست و شمرده نمی‌شود، ولی یک کاراکتر جا می‌گیرد.
    expect(getInput().selectionStart).toBe(5);
  });
});
