"use client";

/**
 * کارتابل — هرچه منتظر تصمیمِ مدیر است، در یک جا.
 *
 * قبلاً سه صفحه‌ی جدا بود: بازبینی عملیات، درخواست‌های افزودن کالا، و لیبل‌های
 * در انتظار. هر سه یک جمله‌اند: **«چه چیزی منتظر من است؟»** مدیر به «نوعِ
 * موردِ منتظر» فکر نمی‌کند، می‌خواهد صف را خالی کند.
 *
 * مهم‌تر از خودِ ادغام، **عددِ روی تب** است. تا دیروز اگر پنج درخواست در صف
 * می‌ماند و مدیر آن منو را باز نمی‌کرد، هیچ‌وقت نمی‌فهمید — صف بی‌صدا بود.
 *
 * سه صفحه‌ی قبلی هنوز مسیرِ خودشان را دارند تا پیوندها و بوکمارک‌ها نشکنند؛
 * فقط از منو برداشته شده‌اند.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";

import {
  getPendingOperations,
  getProductRequests,
  getPendingLabels,
} from "@/lib/api";
import { toFa } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ReviewPanel } from "../review/page";
import { ProductRequestsPanel } from "../product-requests/page";
import { LabelsPanel } from "../labels/page";

/**
 * شمارنده‌ها با همان queryKeyهای خودِ پنل‌ها خوانده می‌شوند، پس react-query
 * نتیجه را به اشتراک می‌گذارد و بازکردنِ تب درخواستِ تازه‌ای نمی‌زند.
 */
function useCounts() {
  const ops = useQuery({
    queryKey: ["pending-operations"],
    queryFn: () => getPendingOperations(),
  });

  const requests = useQuery({
    queryKey: ["product-requests", "PENDING"],
    queryFn: () => getProductRequests("PENDING"),
  });

  const labels = useQuery({
    queryKey: ["pending-labels-count"],
    queryFn: () => getPendingLabels({ limit: 300 }),
  });

  return {
    ops: ops.data?.length ?? 0,
    requests: requests.data?.length ?? 0,
    // خروجی لیبل‌ها صفحه‌بندی‌شده است؛ عددِ کل از meta می‌آید نه از طولِ آرایه.
    labels: labels.data?.meta?.total ?? labels.data?.data?.length ?? 0,
  };
}

/** عددِ کنارِ عنوانِ تب. صفر نشان داده نمی‌شود — صفِ خالی نباید جلب توجه کند. */
function TabCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <Badge variant="destructive" className="mr-1.5 tabular-nums">
      {toFa(n)}
    </Badge>
  );
}

export default function InboxPage() {
  const counts = useCounts();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="کارتابل"
        description="هرچه منتظر تصمیم شماست — عملیات کارگر، درخواست کالا، و لیبل‌ها"
        icon={Inbox}
      />

      <Tabs defaultValue="operations">
        <TabsList>
          <TabsTrigger value="operations">
            بازبینی عملیات
            <TabCount n={counts.ops} />
          </TabsTrigger>
          <TabsTrigger value="requests">
            درخواست کالا
            <TabCount n={counts.requests} />
          </TabsTrigger>
          <TabsTrigger value="labels">
            لیبل‌ها
            <TabCount n={counts.labels} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-4">
          <ReviewPanel embedded />
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <ProductRequestsPanel embedded />
        </TabsContent>

        <TabsContent value="labels" className="mt-4">
          <LabelsPanel embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
