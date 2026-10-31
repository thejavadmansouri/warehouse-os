import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("target") || "ALL";

  const now = new Date();

  const items = await prisma.announcement.findMany({
    where: {
      isActive: true,
      OR: [
        { target: "ALL" },
        { target: target },
      ],
      startsAt: { lte: now },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({ ok: true, items });
}

export async function POST(req: NextRequest) {
  // مدیر می‌تواند اعلان جدید بسازد
  try {
    const body = await req.json();
    const { title, message, level = "INFO", target = "ALL", link, expiresAt } = body;

    if (!title || !message) {
      return NextResponse.json({ ok: false, error: "عنوان و متن الزامی است" }, { status: 400 });
    }

    const created = await prisma.announcement.create({
      data: {
        title,
        message,
        level,
        target,
        link: link || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return NextResponse.json({ ok: true, item: created });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
