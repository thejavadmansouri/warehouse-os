/**
 * چاپ مستقیم حرارتی — یک مسیر برای مرورگر و اپ ویندوزی.
 *
 * - اپ فروشنده (Tauri): TSPL سمت کلاینت → winspool RAW روی پرینتر محلی
 * - مرورگر: API سرور → winspool/TCP روی پرینتر متصل به سرور یا شبکه
 */

import {
  listLabelPrinters,
  printLocationLabelsDirect,
  printProductLabelsDirectApi,
} from "@/lib/api";
import {
  isDesktop,
  printTspLabel,
  getDesktopConfig,
  listDesktopPrinters,
  saveDesktopLabelPrinter,
} from "@/lib/desktop";
import { buildLocationTsplPayload, buildProductTsplPayload } from "@/lib/tspl";
import { ROLL_MEDIA_WIDTH_MM } from "@/lib/label-roll-presets";
import type { LabelSettings, LocationLabel, ProductLabel } from "@/lib/types";

export type DirectPrinterChoice = {
  printerName?: string | null;
  printerHost?: string | null;
  printerPort?: number | null;
};

async function applyDesktopPrinter(name?: string | null) {
  if (!name || !isDesktop()) return;
  await saveDesktopLabelPrinter(name);
}

export async function directPrintLocationLabels(opts: {
  labels: LocationLabel[];
  settings: LabelSettings;
  printer?: DirectPrinterChoice;
}): Promise<{ printed: number; via: "desktop" | "server" }> {
  const { labels, settings, printer } = opts;
  if (!labels.length) throw new Error("داده‌ای برای چاپ لیبل وجود ندارد");

  if (isDesktop()) {
    await applyDesktopPrinter(printer?.printerName);
    const payload = await buildLocationTsplPayload(
      labels.map((l) => ({
        qrCode: l.qrCode,
        code: l.code,
        shortNum: l.shortNum,
        pathText: l.pathText,
      })),
      {
        widthMm: settings.widthMm,
        heightMm: settings.heightMm,
        gapMm: settings.gapMm,
        mediaWidthMm: ROLL_MEDIA_WIDTH_MM,
      },
    );
    await printTspLabel(payload);
    return { printed: labels.length, via: "desktop" };
  }

  await printLocationLabelsDirect({
    ids: labels.map((l) => l.id),
    printerName: printer?.printerName ?? settings.printerName,
    printerHost: printer?.printerHost ?? settings.printerHost,
    printerPort: printer?.printerPort ?? settings.printerPort,
  });
  return { printed: labels.length, via: "server" };
}

export async function directPrintProductLabels(opts: {
  labels: ProductLabel[];
  settings: LabelSettings;
  copies: number;
  perItem?: boolean;
  items?: { productId: string; quantity: number }[];
  printer?: DirectPrinterChoice;
}): Promise<{ printed: number; via: "desktop" | "server" }> {
  const { labels, settings, copies, perItem, items, printer } = opts;
  if (!labels.length) throw new Error("داده‌ای برای چاپ لیبل وجود ندارد");

  if (isDesktop()) {
    await applyDesktopPrinter(printer?.printerName);
    const payload = buildProductTsplPayload(
      labels.map((l) => {
        const qty = perItem
          ? (items!.find((i) => i.productId === l.id)?.quantity ?? 1)
          : Math.max(1, Math.min(500, Math.floor(copies) || 1));
        return {
          label: {
            barcode: l.barcode || l.sku,
            name: l.vehicleModelName || l.name,
          },
          copies: qty,
        };
      }),
      {
        widthMm: settings.widthMm,
        heightMm: settings.heightMm,
        gapMm: settings.gapMm,
        mediaWidthMm: ROLL_MEDIA_WIDTH_MM,
      },
    );
    await printTspLabel(payload);
    return { printed: labels.length, via: "desktop" };
  }

  if (perItem && items?.length) {
    let printed = 0;
    for (const item of items) {
      if (!labels.some((l) => l.id === item.productId)) continue;
      await printProductLabelsDirectApi({
        productIds: [item.productId],
        copies: Math.max(1, Math.min(500, Math.floor(item.quantity) || 1)),
        printerName: printer?.printerName ?? settings.printerName,
        printerHost: printer?.printerHost ?? settings.printerHost,
        printerPort: printer?.printerPort ?? settings.printerPort,
      });
      printed++;
    }
    return { printed, via: "server" };
  }

  await printProductLabelsDirectApi({
    productIds: labels.map((l) => l.id),
    copies: Math.max(1, Math.min(500, Math.floor(copies) || 1)),
    printerName: printer?.printerName ?? settings.printerName,
    printerHost: printer?.printerHost ?? settings.printerHost,
    printerPort: printer?.printerPort ?? settings.printerPort,
  });
  return { printed: labels.length, via: "server" };
}

export async function resolveLabelPrinterList(): Promise<
  Array<{ name: string; isDefault: boolean; source: "desktop" | "server" }>
> {
  if (isDesktop()) {
    try {
      const rows = await listDesktopPrinters();
      return rows.map((r) => ({ ...r, source: "desktop" as const }));
    } catch {
      /* fall through to server list */
    }
  }
  const rows = await listLabelPrinters();
  return rows.map((r) => ({ ...r, source: "server" as const }));
}

export async function resolveSavedLabelPrinterName(
  settings: LabelSettings | null | undefined,
): Promise<string> {
  if (isDesktop()) {
    try {
      const cfg = await getDesktopConfig();
      if (cfg.labelPrinterName) return cfg.labelPrinterName;
    } catch {
      /* ignore */
    }
  }
  return settings?.printerName ?? "";
}
