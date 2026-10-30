import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PickerClient } from "./picker-client";

export const instant = false;

export default async function WarehousePickerPage() {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token ?? "");

  if (session?.role !== "admin") {
    redirect("/login?next=/admin/picker");
  }

  return (
    <main className="min-h-screen bg-slate-900 text-white selection:bg-amber-500 selection:text-black" dir="rtl">
      <PickerClient />
    </main>
  );
}
