"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, PackageCheck, ShoppingCart, Users, Package } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSiteOverview } from "@/lib/api";
import { toFa } from "@/lib/format";

export default function SiteAdminHome() {
  const overview = useQuery({
    queryKey: ["site-admin", "overview"],
    queryFn: getSiteOverview,
  });

  const cards = overview.data
    ? [
        {
          title: "سفارش‌های امروز",
          value: toFa(overview.data.ordersToday),
          icon: ShoppingCart,
        },
        {
          title: "فروش امروز",
          value: toFa(overview.data.salesToday),
          icon: BarChart3,
        },
        {
          title: "در جریان",
          value: toFa(overview.data.inFlight),
          icon: PackageCheck,
        },
        {
          title: "مشتریان سایت",
          value: toFa(overview.data.customers),
          icon: Users,
        },
        {
          title: "کالای آنلاین",
          value: toFa(overview.data.onlineProducts),
          icon: Package,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="نمای کلی فروشگاه اینترنتی"
        description="وضعیت سفارش‌ها و محتوای سایت — این پنل فقط به API سایت وصل است و به سیستم فروش مغازه دسترسی ندارد."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {overview.isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="mt-2 h-4 w-16" />
                </CardContent>
              </Card>
            ))
          : cards.map((c) => (
              <Card key={c.title}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                    <c.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-xl font-bold tabular-nums">{c.value}</div>
                    <div className="text-sm text-muted-foreground">{c.title}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
