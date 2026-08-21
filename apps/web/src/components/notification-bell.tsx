"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell, AlertTriangle, FileClock, Check } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { getAlerts } from "@/lib/api";
import { amount, faDate, money, toFa } from "@/lib/format";

/** کلیدِ ذخیره‌ی «آخرین وضعیتی که کاربر دید». */
const SEEN_KEY = "notif-seen-v1";

/**
 * زنگ اعلان‌ها.
 *
 * اعلان‌ها مشتق‌اند (بدهیِ معوق و چکِ نزدیکِ سررسید از همان دفتر)، نه رکوردِ
 * ذخیره‌شده؛ پس «پاک‌کردن» یعنی «خواندم» — یک امضا از وضعیتِ فعلی ذخیره می‌شود و
 * تا وقتی چیزی عوض نشود، نشانِ قرمز خاموش می‌ماند. خودِ فهرست همیشه برای دیدن
 * باز است، و اگر مورد تازه‌ای پیدا شود نشان دوباره روشن می‌شود.
 */
export function NotificationBell() {
  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: getAlerts,
    refetchInterval: 60_000,
    retry: false,
  });

  const overdue = alerts.data?.overdue;
  const cheques = alerts.data?.cheques;
  const count = (overdue?.customerCount ?? 0) + (cheques?.count ?? 0);

  // امضای وضعیتِ فعلی — با هر تغییرِ محتوا عوض می‌شود.
  const signature = React.useMemo(() => {
    if (!alerts.data) return "";
    return JSON.stringify({
      oc: overdue?.customerCount ?? 0,
      oa: overdue?.amount ?? 0,
      cc: cheques?.count ?? 0,
      oi: overdue?.top?.map((t) => t.id) ?? [],
      ci: cheques?.items?.map((c) => c.id) ?? [],
    });
  }, [alerts.data, overdue, cheques]);

  const [seen, setSeen] = React.useState<string>("");
  React.useEffect(() => {
    try {
      setSeen(localStorage.getItem(SEEN_KEY) ?? "");
    } catch {
      /* localStorage در دسترس نبود — بی‌خیال، فقط نشان همیشه دیده می‌شود. */
    }
  }, []);

  // چیزی برای دیدن هست و با آخرین باری که کاربر «خواندم» زده فرق دارد.
  const unseen = count > 0 && signature !== "" && signature !== seen;

  const markRead = () => {
    setSeen(signature);
    try {
      localStorage.setItem(SEEN_KEY, signature);
    } catch {
      /* نادیده */
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" title="اعلان‌ها">
          <Bell className="h-[18px] w-[18px]" />
          {unseen && (
            <span
              className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center
                         rounded-full bg-destructive px-1 text-[10px] font-bold text-white"
            >
              {toFa(count)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">اعلان‌ها</span>
          {count > 0 && (
            <button
              type="button"
              onClick={markRead}
              disabled={!unseen}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground
                         transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40
                         disabled:hover:bg-transparent"
            >
              <Check className="size-3.5" />
              {unseen ? "خواندم" : "خوانده شد"}
            </button>
          )}
        </div>

        {count === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            چیزی برای رسیدگی نیست
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {!!overdue?.customerCount && (
              <div className="border-b p-3">
                <Link
                  href="/admin/customers"
                  className="flex items-start gap-2 hover:underline"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-destructive">
                      {toFa(overdue.customerCount)} مشتری بدهی معوق دارند
                    </span>
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      مجموع {amount(overdue.amount)}
                    </span>
                  </span>
                </Link>

                <ul className="mt-2 space-y-1">
                  {overdue.top.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="flex justify-between gap-2 rounded px-1 py-0.5 text-xs
                                   hover:bg-muted"
                      >
                        <span className="truncate">{c.fullName}</span>
                        <span className="shrink-0 tabular-nums text-destructive">
                          {money(c.amount)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!cheques?.count && (
              <div className="p-3">
                <div className="flex items-start gap-2">
                  <FileClock className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-warning">
                      {toFa(cheques.count)} چک تا {toFa(cheques.withinDays)} روز آینده
                      سررسید می‌شود
                    </span>
                  </span>
                </div>

                <ul className="mt-2 space-y-1">
                  {cheques.items.slice(0, 5).map((c) => (
                    <li
                      key={c.id}
                      className="flex justify-between gap-2 px-1 text-xs text-muted-foreground"
                    >
                      <span className="truncate" dir="ltr">
                        {toFa(c.number)}
                      </span>
                      <span className="shrink-0 tabular-nums">{faDate(c.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
