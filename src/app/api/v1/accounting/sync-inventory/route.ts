import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/api-key-auth";
import { notifyBackInStock } from "@/lib/stock-alerts";

/*
 * وب‌سرویس به‌روزرسانی موجودی و قیمت قطعات از نرم‌افزار حسابداری
 * متد: POST /api/v1/accounting/sync-inventory
 * هدر: x-api-key: <کلید اتصال>
 * بادی: { items: [ { sku: "SHK-ABS-PRD-01", price: 1250000, stockQty: 80 } ] }
 */
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  try {
    const body = await req.json();
    const items = body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "لیست اقلام ارسالی (items) نامعتبر یا خالی است" },
        { status: 400 }
      );
    }

    let updatedCount = 0;
    const errors: string[] = [];

    for (const item of items) {
      const sku = String(item.sku ?? "").trim();
      if (!sku) continue;

      const updateData: any = {};
      if (typeof item.stockQty === "number" && item.stockQty >= 0) {
        updateData.stockQty = Math.floor(item.stockQty);
      }
      if (typeof item.price === "number" && item.price >= 0) {
        updateData.price = item.price;
      }

      if (Object.keys(updateData).length === 0) continue;

      try {
        const prod = await prisma.product.update({
          where: { sku },
          data: updateData,
          select: { id: true, stockQty: true },
        });
        updatedCount++;

        // اطلاع‌رسانی خودکار به متقاضیان در صورت شارژ موجودی
        if (typeof updateData.stockQty === "number" && updateData.stockQty > 0) {
          notifyBackInStock(prod.id, updateData.stockQty).catch(() => {});
        }
      } catch {
        errors.push(`کد قطعه ${sku} در پایگاه داده کاردو یافت نشد`);
      }
    }

    return NextResponse.json({
      ok: true,
      message: `موجودی و قیمت ${updatedCount} قطعه با نرم‌افزار حسابداری همگام شد.`,
      updatedCount,
      failedCount: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
