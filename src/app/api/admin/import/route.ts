import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import { processCatalogImport, type ImportMode } from "@/lib/import-center";

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت سامانه الزامی است");
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as ImportMode) || "full";

    if (!file) {
      return apiError(400, "NO_FILE", "فایل اکسل یا CSV ارسال نشده است");
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const summary = await processCatalogImport(buffer, mode);

    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (err: any) {
    return apiError(500, "IMPORT_FAILED", err.message || "خطا در پردازش فایل ورود گروهی");
  }
}
