import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import { generateSampleExcelTemplate } from "@/lib/import-center";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت سامانه الزامی است");
  }

  const buffer = generateSampleExcelTemplate();

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="kardo_b2b_sample_template.xlsx"',
    },
  });
}
