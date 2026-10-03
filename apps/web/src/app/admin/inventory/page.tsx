"use client";

/**
 * موجودی — چه چیزی کجاست، جابه‌جایش کن، و ببین چه گذشته.
 *
 * سه صفحه‌ی جدا بودند و دو تای‌شان آیتمِ منو داشتند. ولی «انتقال بین قفسه‌ها»
 * یک **فعل** است نه یک مکان: جایش همان‌جاست که می‌بینی چه چیزی کجاست. و «لاگ
 * موجودی» همان داده‌ی موجودی است در طولِ زمان، نه موضوعی دیگر.
 *
 * انتقال تب شد نه دکمه: جریانِ چندمرحله‌ای دارد (مبدأ، کالا، تعداد، مقصد) و
 * فشردنش در یک دیالوگ، کاری را که روی زمینِ انبار انجام می‌شود سخت‌تر می‌کرد.
 * سودِ اصلی — یعنی نبودنِ دو ردیفِ اضافه در منو و بودنِ عمل کنارِ عدد — همین‌طور
 * هم به دست می‌آید.
 *
 * هر سه مسیرِ قبلی هنوز کار می‌کنند.
 */

import * as React from "react";
import { Boxes } from "lucide-react";

import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { InventoryPanel } from "./_components/stock-panel";
import { InventoryLogsPanel } from "./logs/page";
import { InventoryTransferPanel } from "../inventory-transfer/page";

export default function InventoryHubPage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  // لاگ فقط برای مدیر است؛ انباردار انتقال را می‌بیند ولی تاریخچه را نه.
  const canSeeLogs = hasRole("ADMIN", "MANAGER");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="موجودی"
        description="موجودی فعلی، انتقال بین قفسه‌ها و تاریخچه‌ی حرکت‌ها"
        icon={Boxes}
      />

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">موجودی</TabsTrigger>
          <TabsTrigger value="transfer">انتقال</TabsTrigger>
          {canSeeLogs && <TabsTrigger value="logs">تاریخچه</TabsTrigger>}
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <InventoryPanel embedded />
        </TabsContent>

        <TabsContent value="transfer" className="mt-4">
          <InventoryTransferPanel embedded />
        </TabsContent>

        {canSeeLogs && (
          <TabsContent value="logs" className="mt-4">
            <InventoryLogsPanel embedded />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
