import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export interface BulkItemInput {
  sku: string;
  qty: number;
}

export interface ValidatedBulkItem {
  id: string;
  sku: string;
  name: string;
  brand: string;
  model: string | null;
  category: string;
  partBrand: string | null;
  unit: string;
  requestedQty: number;
  availableQty: number;
  allocatedQty: number;
  unitPrice: number;
  lineTotal: number;
  status: "AVAILABLE" | "PARTIAL" | "OUT_OF_STOCK";
  statusText: string;
}

export interface UnrecognizedBulkItem {
  rawSku: string;
  requestedQty: number;
  reason: string;
}

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return apiError(401, "ANON", "لطفاً ابتدا وارد حساب کاربری شوید");

  const contentType = req.headers.get("content-type") || "";
  let itemsToValidate: BulkItemInput[] = [];

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return apiError(400, "NO_FILE", "فایل اکسل یا CSV ارسال نشده است");
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        return apiError(400, "EMPTY_FILE", "شیت اطلاعاتی در فایل یافت نشد");
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

      // تشخیص ستون‌های کد فنی و تعداد
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!Array.isArray(row) || row.length < 2) continue;

        const col0 = String(row[0] ?? "").trim();
        const col1 = String(row[1] ?? "").trim();

        // عبور از ردیف عنوان اگر متن غیرعددی است
        if (i === 0 && (col0.includes("کد") || col0.toLowerCase().includes("sku") || isNaN(Number(col1)))) {
          continue;
        }

        const qtyNum = parseInt(col1.replace(/\D/g, ""), 10);
        if (col0 && !isNaN(qtyNum) && qtyNum > 0) {
          itemsToValidate.push({ sku: col0, qty: qtyNum });
        }
      }
    } else {
      const json = await req.json().catch(() => ({}));
      if (typeof json.text === "string" && json.text.trim()) {
        const lines = json.text.split(/[\r\n]+/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // جداکننده‌های مجاز: کاما، تب، سمی‌کالن، یا فاصله
          const parts = trimmed.split(/[\t,;|\s]+/);
          if (parts.length >= 2) {
            const rawSku = parts[0].trim();
            const rawQty = parts[1].replace(/\D/g, "");
            const qtyNum = parseInt(rawQty, 10);
            if (rawSku && !isNaN(qtyNum) && qtyNum > 0) {
              itemsToValidate.push({ sku: rawSku, qty: qtyNum });
            }
          }
        }
      } else if (Array.isArray(json.rows)) {
        for (const r of json.rows) {
          if (r.sku && Number(r.qty) > 0) {
            itemsToValidate.push({ sku: String(r.sku).trim(), qty: Math.floor(Number(r.qty)) });
          }
        }
      }
    }

    if (itemsToValidate.length === 0) {
      return apiError(400, "NO_ITEMS", "هیچ ردیف معتبری (کد فنی + تعداد) در داده‌ها یافت نشد");
    }

    // تجمیع اقلام تکراری احتمالی در ورودی
    const consolidatedMap = new Map<string, number>();
    for (const it of itemsToValidate) {
      const key = it.sku.toLowerCase();
      consolidatedMap.set(key, (consolidatedMap.get(key) || 0) + it.qty);
    }

    const uniqueSkus = Array.from(consolidatedMap.keys());

    // واکشی قطعات از پایگاه داده با تطبیق SKU، کد OEM یا بارکد
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { sku: { in: uniqueSkus, mode: "insensitive" } },
          { oemCode: { in: uniqueSkus, mode: "insensitive" } },
          { barcode: { in: uniqueSkus, mode: "insensitive" } },
        ],
      },
      include: {
        volumePrices: { orderBy: { qtyFrom: "asc" } },
      },
    });

    const productByQueryKey = new Map<string, (typeof products)[0]>();
    for (const p of products) {
      productByQueryKey.set(p.sku.toLowerCase(), p);
      if (p.oemCode) productByQueryKey.set(p.oemCode.toLowerCase(), p);
      if (p.barcode) productByQueryKey.set(p.barcode.toLowerCase(), p);
    }

    const tierDiscount = user.role === "customer" ? user.customer.tierDiscount : 0;
    const customerDiscount = user.role === "customer" ? user.customer.customerDiscount : 0;

    const matched: ValidatedBulkItem[] = [];
    const unrecognized: UnrecognizedBulkItem[] = [];

    let totalRequestedQty = 0;
    let totalAllocatedQty = 0;
    let totalEstimatedAmount = 0;

    for (const [key, requestedQty] of consolidatedMap.entries()) {
      totalRequestedQty += requestedQty;
      const product = productByQueryKey.get(key);

      if (!product) {
        unrecognized.push({
          rawSku: key.toUpperCase(),
          requestedQty,
          reason: "کد فنی یا بارکد در کاتالوگ کاردو یافت نشد",
        });
        continue;
      }

      const availableQty = product.stockQty;
      let allocatedQty = 0;
      let status: ValidatedBulkItem["status"] = "OUT_OF_STOCK";
      let statusText = "ناموجود در انبار";

      if (availableQty >= requestedQty) {
        allocatedQty = requestedQty;
        status = "AVAILABLE";
        statusText = "موجود و قابل تخصیص کامل";
      } else if (availableQty > 0) {
        allocatedQty = availableQty;
        status = "PARTIAL";
        statusText = `کسری موجودی (${availableQty} از ${requestedQty} عدد تخصیص یافت)`;
      }

      totalAllocatedQty += allocatedQty;

      // محاسبه قیمت نهایی همکاری
      const base = Number(product.price);
      let volumeDiscount = 0;
      for (const vp of product.volumePrices) {
        if (allocatedQty >= vp.qtyFrom) {
          volumeDiscount = Math.max(volumeDiscount, Number(vp.discountPercent));
        }
      }

      const totalDiscountPercent = Math.min(90, volumeDiscount + tierDiscount + customerDiscount);
      const unitPrice = Math.round(base * (1 - totalDiscountPercent / 100));
      const lineTotal = unitPrice * allocatedQty;

      totalEstimatedAmount += lineTotal;

      matched.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        model: product.model,
        category: product.category,
        partBrand: product.partBrand,
        unit: product.unit,
        requestedQty,
        availableQty,
        allocatedQty,
        unitPrice,
        lineTotal,
        status,
        statusText,
      });
    }

    return NextResponse.json({
      ok: true,
      stats: {
        totalRows: consolidatedMap.size,
        matchedCount: matched.length,
        unrecognizedCount: unrecognized.length,
        totalRequestedQty,
        totalAllocatedQty,
        totalEstimatedAmount,
      },
      matched,
      unrecognized,
    });
  } catch (err: any) {
    return apiError(500, "SERVER_ERROR", err?.message || "خطا در پردازش لیست دسته‌جمعی");
  }
}
