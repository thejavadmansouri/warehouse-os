import { prisma } from "@/lib/prisma";
import type { WalletTxType } from "@prisma/client";

/*
 * کیف پول — دفتر تراکنش (append-only).
 * موجودی = جمع مبلغ‌های علامت‌دار؛ تراکنش‌ها هیچ‌وقت به‌روزرسانی/حذف نمی‌شوند.
 * هر تراکنش `idempotencyKey` یکتا دارد تا تکرار درخواست (رفرش/شبکه) پول دوبار جابه‌جا نکند.
 */

export async function walletBalance(customerId: string): Promise<number> {
  const agg = await prisma.walletTransaction.aggregate({
    where: { customerId },
    _sum: { amount: true },
  });

  return Number(agg._sum.amount ?? 0);
}

export type WalletMove = {
  customerId: string;
  type: WalletTxType;
  amount: number; // مثبت/منفی — تومان
  refType?: string;
  refId?: string;
  idempotencyKey: string;
  note?: string;
};

/**
 * ثبت تراکنش با محاسبه‌ی balanceAfter در یک تراکنش دیتابیس.
 * در صورت موجودی ناکافی برای مبلغ منفی، خطا می‌دهد.
 */
export async function walletMove(move: WalletMove): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey: move.idempotencyKey },
    });

    if (existing) {
      return Number(existing.balanceAfter); // تکرار — همان نتیجه قبلی
    }

    const agg = await tx.walletTransaction.aggregate({
      where: { customerId: move.customerId },
      _sum: { amount: true },
    });

    const current = Number(agg._sum.amount ?? 0);
    const next = current + move.amount;

    if (move.amount < 0 && next < 0) {
      throw new Error("WALLET_INSUFFICIENT");
    }

    await tx.walletTransaction.create({
      data: {
        customerId: move.customerId,
        type: move.type,
        amount: move.amount,
        balanceAfter: next,
        refType: move.refType,
        refId: move.refId,
        idempotencyKey: move.idempotencyKey,
        note: move.note,
      },
    });

    return next;
  });
}
