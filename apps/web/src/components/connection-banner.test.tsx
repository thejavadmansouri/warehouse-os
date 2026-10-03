import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ConnectionBanner } from "./connection-banner";
import { useConnectionStore } from "@/lib/connection-store";

afterEach(() => {
  cleanup();
  // وضعیت store بین تست‌ها نشت نکند.
  useConnectionStore.setState({ online: true, since: null });
  vi.unstubAllGlobals();
});

describe("ConnectionBanner", () => {
  it("در حالت عادی چیزی نشان نمی‌دهد", () => {
    render(<ConnectionBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("وقتی ارتباط قطع است هشدار می‌دهد و می‌گوید داده پاک نشده", () => {
    useConnectionStore.setState({ online: false, since: Date.now() });
    render(<ConnectionBanner />);

    expect(screen.getByRole("alert")).toBeTruthy();
    /*
     * این جمله عمداً تست می‌شود: تمام دلیل وجود این نوار، رفعِ همان سوءتفاهمی
     * است که سه بار پیش آمد — «همه‌چیز پاک شد».
     */
    expect(screen.getByRole("alert").textContent).toContain("هیچ داده‌ای پاک نشده");
  });
});

describe("useConnectionStore", () => {
  it("فقط هنگام تغییرِ وضعیت زمانِ قطعی را می‌گذارد", () => {
    const s = useConnectionStore.getState();

    s.setOnline(false);
    const first = useConnectionStore.getState().since;
    expect(first).toBeTypeOf("number");

    // تکرارِ همان وضعیت نباید زمان را عوض کند، وگرنه «چند دقیقه» صفر می‌ماند.
    useConnectionStore.getState().setOnline(false);
    expect(useConnectionStore.getState().since).toBe(first);

    useConnectionStore.getState().setOnline(true);
    expect(useConnectionStore.getState().since).toBeNull();
  });
});
