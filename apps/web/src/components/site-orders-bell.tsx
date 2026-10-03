"use client";

/*
 * زنگِ «سفارش اینترنتی» — جایگزینِ توست/زنگِ سراسری که روی صندوق هم می‌زد.
 *
 * فقط برای کسانی رندر می‌شود که پرچمِ `canManageSite` دارند و فقط در نوارِ
 * بالای صفحه‌های **غیر از POS** (خودِ `AdminTopbar` این شرط را اعمال می‌کند).
 * صندوقِ مغازه بی‌صدا و بی‌پرت می‌ماند؛ فروشنده‌ی سایت شمارِ سفارش‌هایِ
 * منتظرِ برداشت را زنده می‌بیند و با کلیک به صف می‌رود.
 */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listOnlineOrders } from "@/lib/api";
import { toFa } from "@/lib/format";

export function SiteOrdersBell() {
  const pending = useQuery({
    queryKey: ["online-order-pending"],
    queryFn: () => listOnlineOrders("PLACED"),
    refetchInterval: 60_000,
    retry: 1,
  });

  const count = pending.data?.length ?? 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      asChild
      className="relative size-7"
      title={`سفارش‌های آنلاینِ منتظر برداشت: ${toFa(count)}`}
    >
      <Link href="/admin/online-orders">
        <Store className="size-4" />
        {count > 0 && (
          <span
            className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center
                       rounded-full bg-destructive px-1 text-[10px] font-bold text-white"
          >
            {toFa(count)}
          </span>
        )}
      </Link>
    </Button>
  );
}