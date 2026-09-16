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
 * فقط یعنی یک جای دیگر هم باید بگردد. پرداخت به مشتری هم همین‌طور — قرینه‌ی
 * دریافت با جهتِ معکوس.
 *
 * نقش‌ها روی تب‌ها اعمال می‌شوند: فروشنده فاکتور و پیش‌فاکتور را می‌بیند ولی
 * مرجوعی و دریافت را نه. تبی که اجازه‌اش نیست اصلاً رندر نمی‌شود.
 */

import * as React from "react";

import { useAuthStore } from "@/lib/auth-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { InvoicesPanel } from "../invoices/page";
import { QuotationsPanel } from "../quotations/page";
import { ReturnsPanel } from "../returns/page";
import { ReceiptsPanel } from "../receipts/page";
import { PayoutsPanel } from "../payouts/page";

export default function DocumentsPage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  const isManager = hasRole("ADMIN", "MANAGER");

  return (
    /*
      سرصفحه حذف شد: نامِ صفحه در منوی کناری هست و تکرارش فقط یک سطرِ ارتفاع
      می‌گیرد. تب‌ها خودشان می‌گویند اینجا کجاست.
    */
    <Tabs defaultValue="invoices" className="flex h-[calc(100vh-2.5rem)] flex-col gap-0">
      <TabsList className="h-8 shrink-0 justify-start rounded-none border-b bg-transparent px-2">
        <TabsTrigger value="invoices">فاکتورها</TabsTrigger>
        <TabsTrigger value="quotations">پیش‌فاکتورها</TabsTrigger>
        {isManager && <TabsTrigger value="returns">مرجوعی‌ها</TabsTrigger>}
        {isManager && <TabsTrigger value="receipts">دریافت‌ها</TabsTrigger>}
        {isManager && <TabsTrigger value="payouts">پرداخت‌ها</TabsTrigger>}
      </TabsList>

      {/* هر تب تمامِ ارتفاعِ باقی‌مانده را می‌گیرد — جدول باید تا پایین برود. */}
      <TabsContent value="invoices" className="mt-0 flex min-h-0 flex-1 flex-col">
        <InvoicesPanel embedded />
      </TabsContent>

      <TabsContent value="quotations" className="mt-0 flex min-h-0 flex-1 flex-col overflow-auto">
        <QuotationsPanel embedded />
      </TabsContent>

      {isManager && (
        <TabsContent value="returns" className="mt-0 flex min-h-0 flex-1 flex-col overflow-auto">
          <ReturnsPanel embedded />
        </TabsContent>
      )}

      {isManager && (
        <TabsContent value="receipts" className="mt-0 flex min-h-0 flex-1 flex-col overflow-auto">
          <ReceiptsPanel embedded />
        </TabsContent>
      )}

      {isManager && (
        <TabsContent value="payouts" className="mt-0 flex min-h-0 flex-1 flex-col overflow-auto">
          <PayoutsPanel embedded />
        </TabsContent>
      )}
    </Tabs>
  );
}
