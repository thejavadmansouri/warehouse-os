"use client";

// صفحةِ سئو — automatik است: robots.txt و sitemap.xml از روی کالاهایِ آنلاین و
// وضعیتِ فروشگاه تولید می‌شوند. اینجا فقط وضعیتِ زنده‌ی همان خروجی را نشان
// می‌دهیم؛ هیچ endpointِ ویرایشیِ سئو در بک‌اند نیست و نباید هم باشد.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchCheck, Info } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/api";

function fetchText(path: string): Promise<string> {
  return fetch(`${apiUrl()}${path}`, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("status " + r.status);
    return r.text();
  });
}

export default function SeoPage() {
  const robots = useQuery({ queryKey: ["seo-robots"], queryFn: () => fetchText("/robots.txt") });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="سئو"
        description="خروجیِ زنده‌ی موتورهای جستجو — خودکار از کالاهای آنلاین و وضعیت فروشگاه"
        icon={SearchCheck}
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              این صفحه قابلِ ویرایش نیست: <span dir="ltr">sitemap.xml</span> و{" "}
              <span dir="ltr">robots.txt</span> روی سرور از روی کالاهایِ دارای{" "}
              <code className="rounded bg-muted px-1">showOnline</code> و کلیدِ
              «فروشگاه روشن است» ساخته می‌شوند. وقتی فروشگاه خاموش باشد، robots
              با <span dir="ltr">Disallow: /</span> موتور جستجو را رد می‌کند.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <CardTitle className="mb-2 text-sm font-semibold">
            <span dir="ltr">robots.txt</span>
          </CardTitle>
          {robots.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : robots.isError ? (
            <p className="text-sm text-muted-foreground">خروجی در دسترس نبود.</p>
          ) : (
            <pre
              dir="ltr"
              className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs leading-6 text-foreground"
            >
              {robots.data}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <a
            href={`${apiUrl()}/sitemap.xml`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-primary hover:underline"
            dir="ltr"
          >
            sitemap.xml
          </a>
          <a
            href={`${apiUrl()}/robots.txt`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-primary hover:underline"
            dir="ltr"
          >
            robots.txt
          </a>
        </CardContent>
      </Card>
    </div>
  );
}