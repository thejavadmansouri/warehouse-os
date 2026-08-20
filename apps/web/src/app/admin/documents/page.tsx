"use client";

/**
 * اسناد — فاکتور، پیش‌فاکتور، مرجوعی و دریافت وجه، در یک صفحه.
 *
 * هر چهار تا یک شکل دارند: مشتری، تاریخ، مبلغ، وضعیت. و سؤالی که آدم واقعاً
 * می‌پرسد «این مشتری چه اسنادی دارد؟» است، نه «کدام نوع سند؟» — پس نوعِ سند
 * یک فیلتر است، نه چهار ردیف در منو.
 *
 * ⚠️ دریافت وجه عمداً اینجاست با اینکه کالا جابه‌جا نمی‌کند: از نگاهِ کسی که
 * دنبال یک مشتری می‌گردد، رسیدِ دریافت هم یکی از همان اسناد است. جدا نگه‌داشتنش
 * فقط یعنی یک جای دیگر هم باید بگردد.
 *
 * نقش‌ها روی تب‌ها اعمال می‌شوند: فروشنده فاکتور و پیش‌فاکتور را می‌بیند ولی
 * مرجوعی و دریافت را نه. تبی که اجازه‌اش نیست اصلاً رندر نمی‌شود.
 */

import * as React from "react";
import { Files } from "lucide-react";

import { useAuthStore } from "@/lib/auth-store";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { InvoicesPanel } from "../invoices/page";
import { QuotationsPanel } from "../quotations/page";
import { ReturnsPanel } from "../returns/page";
import { ReceiptsPanel } from "../receipts/page";

export default function DocumentsPage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  const isManager = hasRole("ADMIN", "MANAGER");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="اسناد"
        description="فاکتور، پیش‌فاکتور، مرجوعی و دریافت وجه"
        icon={Files}
      />

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">فاکتورها</TabsTrigger>
          <TabsTrigger value="quotations">پیش‌فاکتورها</TabsTrigger>
          {isManager && <TabsTrigger value="returns">مرجوعی‌ها</TabsTrigger>}
          {isManager && <TabsTrigger value="receipts">دریافت‌ها</TabsTrigger>}
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesPanel embedded />
        </TabsContent>

        <TabsContent value="quotations" className="mt-4">
          <QuotationsPanel embedded />
        </TabsContent>

        {isManager && (
          <TabsContent value="returns" className="mt-4">
            <ReturnsPanel embedded />
          </TabsContent>
        )}

        {isManager && (
          <TabsContent value="receipts" className="mt-4">
            <ReceiptsPanel embedded />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
