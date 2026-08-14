"use client";

import { useQuery } from "@tanstack/react-query";

import { getShopSettings } from "@/lib/api";
import { toFa } from "@/lib/format";

/**
 * سربرگ مغازه روی برگه‌های چاپی.
 *
 * قبلاً بالای فاکتور فقط نام انبار بود — چیزی که برای مشتری هیچ معنایی ندارد.
 * برگه‌ای که از مغازه بیرون می‌رود باید بگوید از کجا آمده و اگر مشتری خواست
 * پول بفرستد، به کجا بفرستد.
 *
 * هر بخش فقط وقتی چاپ می‌شود که پر شده باشد؛ برگه‌ی نصبِ تازه نباید پر از
 * جای خالی باشد.
 */
export function ShopHeader({ fallbackName }: { fallbackName?: string }) {
  const shop = useQuery({
    queryKey: ["shop-settings"],
    queryFn: getShopSettings,
    // روی یک برگه‌ی چاپی، داده‌ی چند دقیقه پیش کاملاً کافی است.
    staleTime: 5 * 60_000,
  });

  const s = shop.data;
  const name = s?.name?.trim() || fallbackName || "";

  return (
    <div className="shop">
      {name && <div className="shop-name">{name}</div>}
      {!!s?.phone && <div className="muted">تلفن: {toFa(s.phone)}</div>}
      {!!s?.address && <div className="muted">{s.address}</div>}
    </div>
  );
}

/**
 * اطلاعات واریز، پایین برگه.
 *
 * روی فاکتور نسیه و صورت‌حساب، مهم‌ترین خطِ کاغذ همین است: مشتری برگه را
 * می‌برد و باید بداند پول را کجا بریزد. شماره چهارتایی جدا می‌شود چون
 * شانزده رقمِ پیوسته را کسی نمی‌تواند از روی کاغذ درست بخواند.
 */
export function ShopPaymentInfo() {
  const shop = useQuery({
    queryKey: ["shop-settings"],
    queryFn: getShopSettings,
    staleTime: 5 * 60_000,
  });

  const s = shop.data;
  if (!s?.cardNumber && !s?.footer) return null;

  const grouped = s.cardNumber
    ? s.cardNumber.replace(/(\d{4})(?=\d)/g, "$1-")
    : "";

  return (
    <section className="note">
      {!!grouped && (
        <div>
          <b>شماره کارت: </b>
          <span dir="ltr">{toFa(grouped)}</span>
          {!!s.cardHolder && <span> — {s.cardHolder}</span>}
        </div>
      )}
      {!!s.footer && <div>{s.footer}</div>}
    </section>
  );
}
