import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

export type ImportMode = "full" | "price_stock_only";

export type ImportError = {
  row: number;
  sku?: string;
  message: string;
};

export type ImportSummary = {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  mode: ImportMode;
  errors: ImportError[];
  sampleItems: Array<{
    sku: string;
    name: string;
    price: number;
    stockQty: number;
    action: "created" | "updated";
  }>;
};

/*
 * نگاشت نام ستون‌های فارسی و انگلیسی به کلیدهای استاندارد سیستم
 */
const COLUMN_ALIASES: Record<string, string> = {
  // کد فنی / SKU
  sku: "sku",
  "کد فنی": "sku",
  "کد کالا": "sku",
  "کد قطعه": "sku",
  "شناسه کالا": "sku",
  partnumber: "sku",
  part_number: "sku",

  // نام قطعه
  name: "name",
  "نام قطعه": "name",
  "شرح کالا": "name",
  "شرح قطعه": "name",
  "نام کالا": "name",
  title: "name",

  // برند خودرو
  brand: "brand",
  خودرو: "brand",
  "برند خودرو": "brand",
  "نوع خودرو": "brand",
  make: "brand",
  vehicle_make: "brand",

  // مدل خودرو
  model: "model",
  "مدل خودرو": "model",
  مدل: "model",
  تیپ: "model",
  vehicle_model: "model",

  // قسمت خودرو / دسته‌بندی
  category: "category",
  "قسمت خودرو": "category",
  "بخش خودرو": "category",
  "دسته بندی": "category",
  دسته‌بندی: "category",
  "گروه کالا": "category",
  سیستم: "category",

  // سازنده قطعه / پارت‌برند
  partbrand: "partBrand",
  part_brand: "partBrand",
  "برند سازنده": "partBrand",
  "سازنده قطعه": "partBrand",
  "پارت برند": "partBrand",
  "پارت‌برند": "partBrand",
  شرکت: "partBrand",
  manufacturer: "partBrand",

  // کد OEM
  oem: "oemCode",
  oemcode: "oemCode",
  oem_code: "oemCode",
  "کد oem": "oemCode",
  "کد بین المللی": "oemCode",
  "کد بین‌المللی": "oemCode",

  // بارکد
  barcode: "barcode",
  بارکد: "barcode",

  // قیمت (تومان)
  price: "price",
  قیمت: "price",
  "قیمت پایه": "price",
  "قیمت همکاری": "price",
  "قیمت (تومان)": "price",
  "قیمت تومان": "price",

  // موجودی انبار
  stock: "stockQty",
  stockqty: "stockQty",
  stock_qty: "stockQty",
  موجودی: "stockQty",
  "تعداد موجودی": "stockQty",
  "موجودی انبار": "stockQty",

  // ضریب بسته
  packsize: "packSize",
  pack_size: "packSize",
  "ضریب بسته": "packSize",
  "تعداد در بسته": "packSize",
  "گام سفارش": "packSize",
  بسته: "packSize",

  // واحد
  unit: "unit",
  واحد: "unit",
  "واحد سنجش": "unit",
};

function normalizeHeader(raw: string): string {
  const clean = String(raw || "").trim().toLowerCase().replace(/[\s_\-]/g, "");
  return COLUMN_ALIASES[clean] || COLUMN_ALIASES[String(raw || "").trim()] || clean;
}

function parseNumber(val: any, fallback = 0): number {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (!val) return fallback;
  const str = String(val).replace(/[^\d.-]/g, "");
  const num = parseFloat(str);
  return isNaN(num) ? fallback : num;
}

/*
 * موتور پردازش دسته جمعی فایل اکسل یا CSV کاتالوگ
 */
export async function processCatalogImport(
  buffer: Buffer,
  mode: ImportMode = "full"
): Promise<ImportSummary> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("فایل اکسل خالی است یا شیتی در آن یافت نشد.");
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("هیچ ردیف داده‌ای در فایل یافت نشد.");
  }

  const summary: ImportSummary = {
    totalRows: rawRows.length,
    createdCount: 0,
    updatedCount: 0,
    failedCount: 0,
    mode,
    errors: [],
    sampleItems: [],
  };

  // پردازش ردیف به ردیف
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNumber = i + 2; // ردیف ۱ هدر است

    // تبدیل هدرهای ردیف به کلیدهای سیستم
    const row: Record<string, any> = {};
    for (const key of Object.keys(raw)) {
      const normalizedKey = normalizeHeader(key);
      row[normalizedKey] = raw[key];
    }

    const sku = String(row.sku || "").trim();
    if (!sku) {
      summary.failedCount++;
      summary.errors.push({
        row: rowNumber,
        message: "کد فنی (SKU) الزامی است و نمی‌تواند خالی باشد.",
      });
      continue;
    }

    const price = parseNumber(row.price, -1);
    if (price < 0) {
      summary.failedCount++;
      summary.errors.push({
        row: rowNumber,
        sku,
        message: `قیمت نامعتبر است: ${row.price}`,
      });
      continue;
    }

    const stockQty = Math.max(0, Math.floor(parseNumber(row.stockQty, 0)));
    const packSize = Math.max(1, Math.floor(parseNumber(row.packSize, 1)));

    try {
      const existing = await prisma.product.findUnique({
        where: { sku },
      });

      if (mode === "price_stock_only") {
        if (!existing) {
          summary.failedCount++;
          summary.errors.push({
            row: rowNumber,
            sku,
            message: `قطعه با کد فنی ${sku} در سامانه یافت نشد؛ در حالت «فقط قیمت و موجودی» نمی‌توان کالا جدید اضافه کرد.`,
          });
          continue;
        }

        await prisma.product.update({
          where: { sku },
          data: {
            price,
            stockQty,
          },
        });

        summary.updatedCount++;
        if (summary.sampleItems.length < 5) {
          summary.sampleItems.push({
            sku,
            name: existing.name,
            price,
            stockQty,
            action: "updated",
          });
        }
      } else {
        // حالت Full (افزودن کامل یا به‌روزرسانی کامل)
        const name = String(row.name || existing?.name || "").trim();
        if (!name) {
          summary.failedCount++;
          summary.errors.push({
            row: rowNumber,
            sku,
            message: "شرح یا نام قطعه الزامی است.",
          });
          continue;
        }

        const brand = String(row.brand || existing?.brand || "عمومی").trim();
        const model = String(row.model || existing?.model || "").trim() || null;
        const category = String(row.category || existing?.category || "لوازم عمومی").trim();
        const partBrand = String(row.partBrand || existing?.partBrand || "").trim() || null;
        const oemCode = String(row.oemCode || existing?.oemCode || "").trim() || null;
        const barcode = String(row.barcode || existing?.barcode || "").trim() || null;
        const unit = String(row.unit || existing?.unit || "عدد").trim() || "عدد";

        if (existing) {
          await prisma.product.update({
            where: { sku },
            data: {
              name,
              brand,
              model,
              category,
              partBrand,
              oemCode,
              barcode,
              price,
              stockQty,
              packSize,
              unit,
              isActive: true,
            },
          });
          summary.updatedCount++;
          if (summary.sampleItems.length < 5) {
            summary.sampleItems.push({
              sku,
              name,
              price,
              stockQty,
              action: "updated",
            });
          }
        } else {
          await prisma.product.create({
            data: {
              sku,
              name,
              brand,
              model,
              category,
              partBrand,
              oemCode,
              barcode,
              price,
              stockQty,
              packSize,
              unit,
              isActive: true,
            },
          });
          summary.createdCount++;
          if (summary.sampleItems.length < 5) {
            summary.sampleItems.push({
              sku,
              name,
              price,
              stockQty,
              action: "created",
            });
          }
        }
      }
    } catch (err: any) {
      summary.failedCount++;
      summary.errors.push({
        row: rowNumber,
        sku,
        message: err.message || "خطای پایگاه داده در ذخیره ردیف",
      });
    }
  }

  return summary;
}

/*
 * ایجاد فایل اکسل نمونه استاندارد جهت دانلود توسط انباردار و تأمین‌کننده
 */
export function generateSampleExcelTemplate(): Buffer {
  const sampleData = [
    {
      "کد فنی": "IK-206-BRK01",
      "نام قطعه": "لنت ترمز چرخ جلو پژو ۲۰۶ تیپ ۲ و ۳",
      "برند خودرو": "پژو",
      "مدل خودرو": "۲۰۶",
      "قسمت خودرو": "سیستم ترمز",
      "برند سازنده": "ایساکو",
      "کد OEM": "4252.18",
      بارکد: "6260123456789",
      "قیمت (تومان)": 485000,
      "موجودی انبار": 120,
      "تعداد در بسته": 1,
      "واحد سنجش": "دست",
    },
    {
      "کد فنی": "SA-PRD-SPK01",
      "نام قطعه": "شمع موتور انژکتوری پراید و تیبا (پایه کوتاه)",
      "برند خودرو": "پراید",
      "مدل خودرو": "۱۳۱",
      "قسمت خودرو": "موتور",
      "برند سازنده": "بوش (Bosch)",
      "کد OEM": "0242235667",
      بارکد: "6260123456790",
      "قیمت (تومان)": 145000,
      "موجودی انبار": 350,
      "تعداد در بسته": 4,
      "واحد سنجش": "عدد",
    },
    {
      "کد فنی": "IK-405-CLT01",
      "نام قطعه": "کیت کلاچ کامل پژو ۴۰۵ و پارس و سمند (دیسک و صفحه)",
      "برند خودرو": "پژو",
      "مدل خودرو": "۴۰۵",
      "قسمت خودرو": "گیربکس و انتقال قدرت",
      "برند سازنده": "والئو (Valeo)",
      "کد OEM": "826360",
      بارکد: "6260123456791",
      "قیمت (تومان)": 3950000,
      "موجودی انبار": 45,
      "تعداد در بسته": 1,
      "واحد سنجش": "کیت",
    },
    {
      "کد فنی": "SA-KUK-FLT01",
      "نام قطعه": "فیلتر روغن کوییک و ساینا و تیبا",
      "برند خودرو": "سایپا",
      "مدل خودرو": "کوییک",
      "قسمت خودرو": "فیلتراسیون",
      "برند سازنده": "سرکان",
      "کد OEM": "SF-7782",
      بارکد: "6260123456792",
      "قیمت (تومان)": 98000,
      "موجودی انبار": 280,
      "تعداد در بسته": 12,
      "واحد سنجش": "عدد",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "کاتالوگ_کاردو_B2B");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
