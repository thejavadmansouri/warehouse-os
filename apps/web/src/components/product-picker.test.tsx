import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ProductPicker } from "./product-picker";

const searchProducts = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ searchProducts }));

/*
 * jsdom این دو API مرورگر را ندارد و cmdk/radix هنگام باز شدنِ پاپ‌آور
 * صدایشان می‌زنند. نبودشان ایرادِ کامپوننت نیست، کمبودِ محیط تست است.
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

Element.prototype.scrollIntoView ??= function scrollIntoView() {};

afterEach(() => {
  cleanup();
  searchProducts.mockReset();
});

function Harness({ onPick }: { onPick?: (id: string | null) => void } = {}) {
  const [value, setValue] = React.useState<string | null>(null);
  const client = React.useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    [],
  );
  return (
    <QueryClientProvider client={client}>
      <ProductPicker
        value={value}
        onChange={(id) => {
          setValue(id);
          onPick?.(id);
        }}
      />
    </QueryClientProvider>
  );
}

const openMenu = () => fireEvent.click(screen.getByRole("combobox"));
const typeSearch = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText("نام یا کد کالا…"), {
    target: { value: text },
  });

describe("ProductPicker", () => {
  it("در حالت اولیه «همه محصولات» را نشان می‌دهد", () => {
    render(<Harness />);
    expect(screen.getByRole("combobox").textContent).toContain("همه محصولات");
  });

  /*
   * مهم‌ترین تستِ این فایل: کاتالوگ ۳۳ هزار کالا دارد و فهرست کشویی قبلی فقط
   * ۵۰ تای اول را داشت. اینجا تضمین می‌شود که هیچ فهرستِ از پیش بارگذاری‌شده‌ای
   * وجود ندارد و جست‌وجو واقعاً به سرور می‌رود.
   */
  it("پیش از تایپ هیچ درخواستی به سرور نمی‌زند", async () => {
    render(<Harness />);
    openMenu();
    await waitFor(() =>
      expect(screen.getByText("برای جست‌وجو حداقل دو حرف بنویسید")).toBeTruthy(),
    );
    expect(searchProducts).not.toHaveBeenCalled();
  });

  it("با تایپ، جست‌وجو به سرور می‌رود و نتیجه‌ها می‌آیند", async () => {
    searchProducts.mockResolvedValue([
      { id: "p1", name: "لنت جلو پراید", sku: "۱۲۳" },
      { id: "p2", name: "لنت عقب پراید", sku: "۴۵۶" },
    ]);

    render(<Harness />);
    openMenu();
    typeSearch("لنت پراید");

    await waitFor(
      () => expect(screen.getByText("لنت جلو پراید")).toBeTruthy(),
      { timeout: 2000 },
    );
    expect(searchProducts).toHaveBeenCalledWith("لنت پراید");
  });

  it("انتخاب یک کالا، مقدار را بالا می‌فرستد و نامش را نشان می‌دهد", async () => {
    searchProducts.mockResolvedValue([{ id: "p1", name: "لنت جلو پراید", sku: "۱۲۳" }]);
    const onPick = vi.fn();

    render(<Harness onPick={onPick} />);
    openMenu();
    typeSearch("لنت");

    await waitFor(
      () => expect(screen.getByText("لنت جلو پراید")).toBeTruthy(),
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByText("لنت جلو پراید"));

    await waitFor(() => expect(onPick).toHaveBeenCalledWith("p1"));
    expect(screen.getByRole("combobox").textContent).toContain("لنت جلو پراید");
  });

  it("دکمه‌ی پاک‌کردن فیلتر را به «همه محصولات» برمی‌گرداند", async () => {
    searchProducts.mockResolvedValue([{ id: "p1", name: "لنت جلو پراید", sku: "۱۲۳" }]);

    render(<Harness />);
    openMenu();
    typeSearch("لنت");
    await waitFor(
      () => expect(screen.getByText("لنت جلو پراید")).toBeTruthy(),
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByText("لنت جلو پراید"));

    const clear = await screen.findByLabelText("پاک کردن فیلتر محصول");
    fireEvent.click(clear);

    expect(screen.getByRole("combobox").textContent).toContain("همه محصولات");
  });
});
