"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getShopSettings } from "@/lib/api";
import {
  desktopTestPrint,
  getDesktopConfig,
  isDesktop,
  listDesktopPrinters,
  printReceiptBytes,
  saveDesktopPrinter,
  type DesktopPrinter,
} from "@/lib/desktop";
import type { Invoice } from "@/lib/types";

import { renderThermalReceipt } from "../_lib/thermal";

/**
 * فیش حرارتی ۸۰mm — پیش‌نمایش، انتخاب پرینتر و چاپ.
 *
 * فقط داخل قابِ دسکتاپ معنا دارد: بایت‌های ESC/POS با `print_receipt` به
 * spooler می‌روند (datatype=RAW). بومِ پیش‌نمایش همان بومی است که بایت‌ها از
 * روی آن ساخته می‌شوند — فروشنده دقیقاً همان چیزی را می‌بیند که چاپ می‌شود.
 *
 * انتخابِ پرینتر در تنظیماتِ قاب ذخیره می‌شود (`set_printer_name`) تا دفعه‌ی
 * بعد هم همان پرینتر باشد؛ خالی یعنی «پرینتر پیش‌فرض ویندوز».
 */
export function ThermalReceipt({ invoice: inv }: { invoice: Invoice }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [printers, setPrinters] = useState<DesktopPrinter[] | null>(null);
  const [printer, setPrinter] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const shop = useQuery({
    queryKey: ["shop-settings"],
    queryFn: getShopSettings,
    staleTime: 5 * 60_000,
  });

  // فهرست پرینترها + انتخابِ ذخیره‌شده — فقط در قاب.
  useEffect(() => {
    if (!isDesktop()) return;
    let alive = true;
    void (async () => {
      try {
        const [rows, cfg] = await Promise.all([
          listDesktopPrinters(),
          getDesktopConfig(),
        ]);
        if (!alive) return;
        setPrinters(rows);
        setPrinter(cfg.printerName ?? "");
      } catch {
        if (alive) setPrinters([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const draw = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return renderThermalReceipt(canvas, inv, { shop: shop.data ?? null });
  };

  // پیش‌نمایش، هم‌زمان با رسیدنِ تنظیماتِ فروشگاه رسم می‌شود.
  useEffect(() => {
    if (shop.isLoading) return;
    void draw().catch(() => undefined);
    // draw از داده‌ی همان رندر می‌سازد؛ وابستگی به تابع لازم نیست.
  }, [inv, shop.data]);

  const printNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const rendered = await draw();
      if (!rendered) return;
      await printReceiptBytes(rendered.bytes);
      toast.success("فیش چاپ شد");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "چاپ ناموفق بود");
    } finally {
      setBusy(false);
    }
  };

  const changePrinter = async (name: string) => {
    setPrinter(name);
    try {
      await saveDesktopPrinter(name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ذخیره‌ی پرینتر ناموفق بود");
    }
  };

  const testPrinter = async () => {
    try {
      await desktopTestPrint();
      toast.success("برگه‌ی تست به پرینتر رفت");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تست پرینتر ناموفق بود");
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 p-4">
      <div className="no-print flex w-full flex-wrap items-center gap-2 rounded-lg border bg-white p-3 text-sm">
        <span className="text-slate-600">پرینتر:</span>
        <select
          value={printer}
          onChange={(e) => void changePrinter(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          <option value="">پرینتر پیش‌فرض ویندوز</option>
          {(printers ?? []).map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.isDefault ? " (پیش‌فرض)" : ""}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void testPrinter()}
          className="rounded-md border border-slate-300 px-3 py-1 text-slate-700"
        >
          تست پرینتر
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void printNow()}
          className="ms-auto rounded-md bg-blue-600 px-4 py-1.5 font-medium text-white disabled:opacity-60"
        >
          {busy ? "در حال چاپ…" : "چاپ فیش"}
        </button>
      </div>

      <p className="no-print text-xs text-slate-500">
        فیش ۸۰ میلی‌متری برای پرینتر حرارتی — چاپ خام ESC/POS، بدون دیالوگِ
        ویندوز. متن فارسی به‌صورت تصویر چاپ می‌شود تا حروف درست بچسبند.
      </p>

      {/* بومِ پیش‌نمایش = مبنای بایت‌های چاپ. با zoom، اندازه‌ی واقعی کاغذ. */}
      <canvas
        ref={canvasRef}
        className="rounded bg-white shadow ring-1 ring-slate-200"
        style={{ width: 320, imageRendering: "pixelated" }}
      />
    </div>
  );
}
