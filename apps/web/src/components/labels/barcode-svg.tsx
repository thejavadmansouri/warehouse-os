"use client";

/**
 * بارکدِ خطی برای **پیش‌نمایش** لیبل کالا.
 *
 * چرا لازم شد: چاپِ لیبل کالا سمت سرور انجام می‌شود و از قبل بارکد خطی
 * (CODE128) می‌زند — ولی کارتِ پیش‌نمایشِ روی صفحه QR نشان می‌داد. یعنی چیزی
 * که مدیر می‌دید با چیزی که از پرینتر بیرون می‌آمد یکی نبود، و تنها راهِ
 * فهمیدنش چاپ‌کردن روی لیبلِ واقعی بود.
 *
 * CODE128 انتخاب شده چون همان چیزی است که سرور می‌زند و هر اسکنری می‌خواندش.
 * اگر روزی سرور عوض شد، این هم باید عوض شود — پیش‌نمایشی که دروغ بگوید از
 * نداشتنش بدتر است.
 */

import * as React from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import JsBarcode from "jsbarcode";

export function BarcodeSvg({
  value,
  /** ارتفاعِ خودِ میله‌ها به پیکسل — متن زیرش جدا حساب می‌شود. */
  height = 28,
  className,
}: {
  value: string;
  height?: number;
  className?: string;
}) {
  const ref = React.useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        // باریک‌ترین میله. کمتر از این روی چاپگر حرارتی به‌هم می‌چسبد.
        width: 1.4,
        margin: 0,
        // متنِ بارکد جداگانه زیر کارت چاپ می‌شود؛ اینجا تکراری می‌شد.
        displayValue: false,
      });
    } catch {
      // مقدارِ غیرقابل‌کدشدن — کارت بدون بارکد می‌ماند، ولی صفحه نمی‌شکند.
    }
  }, [value, height]);

  return <svg ref={ref} className={className} />;
}
