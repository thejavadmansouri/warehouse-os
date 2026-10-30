import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import { isValidSayadId, getActiveChequesSummary } from "@/lib/cheques";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return apiError(401, "UNAUTHORIZED", "ابتدا وارد حساب همکار شوید");
  }

  const customer = user.customer;

  const summary = await getActiveChequesSummary(customer.id);

  return NextResponse.json({
    ok: true,
    summary: {
      activeRegisteredAmount: summary.activeRegisteredAmount,
      pendingAmount: summary.pendingAmount,
      clearedAmount: summary.clearedAmount,
      hasBounced: summary.hasBounced,
    },
    cheques: summary.cheques.map((c) => ({
      id: c.id,
      sayadId: c.sayadId,
      chequeNumber: c.chequeNumber,
      bankName: c.bankName,
      branchName: c.branchName,
      drawerName: c.drawerName,
      amount: Number(c.amount),
      issueDate: c.issueDate.toISOString(),
      dueDate: c.dueDate.toISOString(),
      status: c.status,
      adminNote: c.adminNote,
      sayadVerified: c.sayadVerified,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

const registerChequeSchema = z.object({
  sayadId: z.string().trim().refine(isValidSayadId, "شناسه صیاد باید دقیقاً ۱۶ رقم عددی باشد"),
  chequeNumber: z.string().trim().min(1, "شماره سریال چک الزامی است"),
  bankName: z.string().trim().min(2, "نام بانک صادرکننده الزامی است"),
  branchName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  drawerName: z.string().trim().min(2, "نام و نام خانوادگی صاحب حساب الزامی است"),
  drawerNationalId: z.string().trim().optional(),
  amount: z.number().positive("مبلغ چک باید بزرگتر از صفر باشد"),
  issueDate: z.string().min(8, "تاریخ صدور چک الزامی است"),
  dueDate: z.string().min(8, "تاریخ سررسید چک الزامی است"),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return apiError(401, "UNAUTHORIZED", "ابتدا وارد حساب همکار شوید");
  }

  const customer = user.customer;

  const body = await req.json().catch(() => ({}));
  const parsed = registerChequeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی چک ناقص است");
  }

  const data = parsed.data;

  // بررسی عدم ثبت چک تکراری با شناسه صیاد یکسان
  const existing = await prisma.cheque.findFirst({
    where: {
      sayadId: data.sayadId,
      customerId: customer.id,
      status: { notIn: ["REJECTED"] },
    },
  });

  if (existing) {
    return apiError(400, "DUPLICATE_SAYAD", "این شناسه صیاد قبلاً در سامانه ثبت شده است.");
  }

  const cheque = await prisma.cheque.create({
    data: {
      customerId: customer.id,
      sayadId: data.sayadId,
      chequeNumber: data.chequeNumber,
      bankName: data.bankName,
      branchName: data.branchName || null,
      accountNumber: data.accountNumber || null,
      drawerName: data.drawerName,
      drawerNationalId: data.drawerNationalId || null,
      amount: data.amount,
      issueDate: new Date(data.issueDate),
      dueDate: new Date(data.dueDate),
      status: "RECEIVED",
    },
  });

  return NextResponse.json({
    ok: true,
    cheque: {
      id: cheque.id,
      sayadId: cheque.sayadId,
      chequeNumber: cheque.chequeNumber,
      bankName: cheque.bankName,
      amount: Number(cheque.amount),
      dueDate: cheque.dueDate.toISOString(),
      status: cheque.status,
    },
  });
}
