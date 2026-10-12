"use client";

// نوار اعتماد بالای پاورقی — چهار قولی که مشتریِ تازه‌وارد باید بی‌درنگ ببیند
// (استاندارد همه‌ی فروشگاه‌های بزرگ: دیجیکالا، ترب، آمازون). متن‌ها ثابت‌اند
// چون قولِ کسب‌وکارند نه تنظیماتِ قابل‌تغییرِ روزانه.
import { BadgeCheck, Headset, Truck, Wallet } from "lucide-react";

const ITEMS = [
  { icon: BadgeCheck, title: "ضمانت اصالت کالا", desc: "قطعه‌ی اصلی و شرکتی" },
  { icon: Truck, title: "ارسال سریع", desc: "به سراسر کشور" },
  { icon: Wallet, title: "پرداخت در محل", desc: "نقدی یا کارت‌به‌کارت" },
  { icon: Headset, title: "مشاوره‌ی خرید", desc: "راهنمایی انتخاب قطعه" },
];

export function TrustStrip() {
  return (
    <section aria-label="چرا از ما بخرید" className="border-t bg-card">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 lg:grid-cols-4">
        {ITEMS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{title}</span>
              <span className="block truncate text-xs text-muted-foreground">{desc}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
