import { prisma } from "@/lib/prisma";
import { shamsiYear } from "@/lib/date";

/*
 * شماره‌گذاری اسناد — بدون شکاف و قابل اتکا در همزمانی:
 * upsert + increment داخل یک تراکنش دیتابیس.
 */
export async function nextOrderNumber(): Promise<string> {
  const year = shamsiYear();

  const counter = await prisma.documentCounter.upsert({
    where: { key: `order:${year}` },
    create: { key: `order:${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });

  return `PF-${year}-${String(counter.value).padStart(4, "0")}`;
}

export async function nextInquiryNumber(): Promise<string> {
  const year = shamsiYear();

  const counter = await prisma.documentCounter.upsert({
    where: { key: `inquiry:${year}` },
    create: { key: `inquiry:${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });

  return `RFQ-${year}-${String(counter.value).padStart(4, "0")}`;
}

export async function nextRmaNumber(): Promise<string> {
  const year = shamsiYear();

  const counter = await prisma.documentCounter.upsert({
    where: { key: `rma:${year}` },
    create: { key: `rma:${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });

  return `RMA-${year}-${String(counter.value).padStart(4, "0")}`;
}

export async function nextTransferNumber(): Promise<string> {
  const year = shamsiYear();

  const counter = await prisma.documentCounter.upsert({
    where: { key: `transfer:${year}` },
    create: { key: `transfer:${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });

  return `TRF-${year}-${String(counter.value).padStart(4, "0")}`;
}


