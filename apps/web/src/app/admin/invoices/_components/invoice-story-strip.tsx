"use client";

/**
 * نوارِ سرگذشتِ فاکتور — یک سطرِ فشرده زیر جدولِ فاکتورها.
 *
 * سؤالِ صندوقدار این است: «این فاکتور چه شد و چرا مانده‌اش این عدد است؟»
 * مثلاً فاکتور ۱۰ میلیونی، در فلان روز این‌قدر دریافت شده و این‌قدر مانده.
 * پس زنجیره به ترتیبِ زمان می‌آید: فاکتور → مرجوعی → اصلاحیه → دریافت →
 * برگشتِ پرداخت، و از اول هم ماندهٔ همین فاکتور جدا و همیشه‌دیدنی می‌آید.
 *
 * ⚠️ عددِ مبلغ‌ها از فیلدهای خودِ فاکتور (`total`/`paidAmount`) خوانده نمی‌شود:
 * مرجوعی و اصلاحیه آن‌ها را به‌روز نمی‌کنند و همین بود که «۴۰ میلیون» را برای
 * فاکتورِ ۲۰ میلیونی نشان می‌داد. سندهای حساب از دفترِ مشتری می‌آیند،
 * پرداخت‌ها از تخصیصِ رسیدها، و مانده از همان `dueAmount`ی که ستون «مانده»
 * و صندوق نشان می‌دهند.
 */

import { money, toFa, faDateTime, PAYMENT_LABELS } from "@/lib/format";
import type {
  InvoiceStory,
  InvoiceStoryEvent,
  InvoiceStoryPayment,
  InvoiceStorySalePayment,
} from "@/lib/types";

/**
 * برچسبِ کوتاهِ هر رویداد — کوتاه‌تر از برچسبِ صورتحساب، چون این‌جا جا تنگ
 * است و «برگشت کالا» و «اصلاحیه‌ی فاکتور» در یک سطر جا نمی‌شوند.
 */
const SHORT_LABELS: Record<string, string> = {
  OPENING: "ماندهٔ اول دوره",
  INVOICE: "فاکتور",
  RECEIPT: "دریافت",
  INVOICE_CANCELLED: "ابطال",
  RETURN: "مرجوعی",
  CORRECTION: "اصلاحیه",
  CHEQUE_BOUNCED: "چک برگشتی",
  CHEQUE_CASHED: "وصول چک",
  FINANCE_CHARGE: "سود مدت‌دار",
  ADJUSTMENT: "اصلاح حساب",
  PAYOUT: "پرداخت به مشتری",
  PAYMENT_REVERSED: "برگشت پرداخت",
  RECOMPOSE: "اصلاح پرداخت",
};

/** «۲۸ شهریور» — تاریخِ کوتاهِ شمسی؛ ساعت کامل در tooltip می‌آید. */
function shortJalaliDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-nu-arabext", {
    day: "numeric",
    month: "long",
  }).format(d);
}

/** رنگِ عدد بر اساس اثرش روی بدهی، نه نوعش. */
function amountTone(kind: string, amount: number): string {
  if (kind === "INVOICE_CANCELLED") return "text-muted-foreground line-through";
  if (amount < 0) return "text-success";
  if (amount > 0 && kind !== "INVOICE") return "text-warning";
  return "text-foreground";
}

/** همهٔ چیزهایی که در این سطر با هم و به ترتیبِ زمان نمایش داده می‌شوند. */
type StoryItem =
  | { type: "event"; at: string; key: string; event: InvoiceStoryEvent }
  | { type: "payment"; at: string; key: string; payment: InvoiceStoryPayment }
  | {
      type: "salePayment";
      at: string;
      key: string;
      salePayment: InvoiceStorySalePayment;
    }
  | {
      type: "offAccountRefund";
      at: string;
      key: string;
      refund: InvoiceStory["offAccountRefunds"][number];
    };

const chip =
  "rounded-md border bg-muted/40 px-1.5 py-0 text-[11px] whitespace-nowrap";
/** نشان‌های «بیرونِ حساب» — خط‌چین تا با ردیف‌های دفتر قاطی نشوند. */
const infoChip =
  "rounded-md border border-dashed bg-background px-1.5 py-0 text-[11px] whitespace-nowrap";

/**
 * نشانِ یک رویداد: «مرجوعی ۳۶ · ۲۸ شهریور · −۲۰٬۰۰۰٬۰۰۰».
 *
 * تاریخِ خودِ فاکتور تکرار نمی‌شود: همان ردیفِ جدول بالای همین نوار، تاریخ و
 * ساعتِ فاکتور را دارد و تکرارِ آن فقط جا می‌خورد.
 */
function EventChip({
  event,
  invoiceNumber,
}: {
  event: InvoiceStoryEvent;
  invoiceNumber: number;
}) {
  const sign = event.amount < 0 ? "−" : event.amount > 0 ? "+" : "";
  const label = SHORT_LABELS[event.kind] ?? event.kind;
  const isInvoice = event.kind === "INVOICE";
  const docNumber = event.docNumber ?? (isInvoice ? invoiceNumber : null);
  return (
    <span
      className={chip}
      title={[event.note, faDateTime(event.at)].filter(Boolean).join(" — ")}
    >
      <span className="text-muted-foreground">
        {label}
        {docNumber ? ` ${toFa(docNumber)}` : ""}
        {isInvoice ? "" : ` · ${shortJalaliDate(event.at)}`}
        {" · "}
      </span>
      <b className={`tabular-nums ${amountTone(event.kind, event.amount)}`}>
        {sign}
        {money(Math.abs(event.amount))}
      </b>
      {event.method ? (
        <span className="text-muted-foreground">
          {" "}
          {PAYMENT_LABELS[event.method] ?? event.method}
        </span>
      ) : null}
    </span>
  );
}

export function InvoiceStoryStrip({
  story,
  loading,
}: {
  story?: InvoiceStory | null;
  loading?: boolean;
}) {
  if (loading && !story) {
    return (
      <div className="shrink-0 border-t bg-muted/30 px-3 py-0.5 text-[11px] text-muted-foreground">
        …
      </div>
    );
  }
  if (!story) return null;

  /*
    یک لیستِ زمانیِ واحد: سندهای دفتر (فاکتور/مرجوعی/اصلاحیه/برگشت پرداخت)،
    پرداخت‌های تخصیص‌یافته به همین فاکتور، و آن دو چیزی که بیرونِ حساب مانده‌اند
    (پولِ سرِ فروش و مرجوعیِ نقد/کارت).
  */
  const items: StoryItem[] = [
    ...story.events.map((e): StoryItem => ({
      type: "event",
      at: e.at,
      key: e.id,
      event: e,
    })),
    ...story.payments.map((p): StoryItem => ({
      type: "payment",
      at: p.at,
      key: p.id,
      payment: p,
    })),
    ...story.salePayments.map((p): StoryItem => ({
      type: "salePayment",
      at: p.at,
      key: p.id,
      salePayment: p,
    })),
    ...story.offAccountRefunds.map((r): StoryItem => ({
      type: "offAccountRefund",
      at: r.at,
      key: r.id,
      refund: r,
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    /*
      مانده اول می‌آید (سمتِ راست)، چون مهم‌ترین عدد است و زنجیره‌ی سمتِ چپش
      اگر جا نشد افقی اسکرول می‌خورد — بدونِ اینکه این عدد از دید بیرون برود.
    */
    <div className="flex shrink-0 items-center gap-x-2 border-t bg-muted/30 px-3 py-0.5 text-[11px]">
      <span
        className="shrink-0 rounded-md border bg-card px-1.5 py-0 font-bold"
        title="ماندهٔ همین فاکتور — با هر دریافت، مرجوعی و اصلاحیه تازه می‌شود"
      >
        ماندهٔ این فاکتور:{" "}
        <b className="tabular-nums text-warning">{money(story.due)}</b>
      </span>

      <span className="shrink-0 font-medium text-muted-foreground">
        سرگذشت:
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-x-1.5 overflow-x-auto pb-0.5 whitespace-nowrap">
        {!items.length ? (
          <span className="text-muted-foreground">
            مشتری ندارد (نقدی گذری) — گردش دفتری‌ای ثبت نشده
          </span>
        ) : (
          items.map((item) => {
            if (item.type === "event") {
              return (
                <EventChip
                  key={item.key}
                  event={item.event}
                  invoiceNumber={story.invoice.number}
                />
              );
            }

            /* پرداختِ روی این فاکتور — «در فلان روز این‌قدر داد». */
            if (item.type === "payment") {
              const methods = [
                ...new Set(
                  item.payment.methods.map((m) => PAYMENT_LABELS[m] ?? m),
                ),
              ].join("+");
              return (
                <span
                  key={item.key}
                  className={chip}
                  title={`رسید ${toFa(item.payment.receiptNumber)} — ${faDateTime(item.at)}`}
                >
                  <span className="text-muted-foreground">
                    دریافت {toFa(item.payment.receiptNumber)} ·{" "}
                    {shortJalaliDate(item.at)} ·{" "}
                  </span>
                  <b className="tabular-nums text-success">
                    −{money(item.payment.amount)}
                  </b>
                  {methods ? (
                    <span className="text-muted-foreground"> ({methods})</span>
                  ) : null}
                </span>
              );
            }

            /* پولِ سرِ فروش: از اول بدهی نبود، روی حساب هم نمی‌نشیند. */
            if (item.type === "salePayment") {
              return (
                <span
                  key={item.key}
                  className={`${infoChip} text-muted-foreground`}
                  title={`پرداخت هنگام فروش — ${faDateTime(item.at)}`}
                >
                  پرداخت سرِ فروش · {shortJalaliDate(item.at)} ·{" "}
                  <b className="tabular-nums text-foreground">
                    {money(item.salePayment.amount)}
                  </b>{" "}
                  (
                  {PAYMENT_LABELS[item.salePayment.method] ??
                    item.salePayment.method}
                  )
                </span>
              );
            }

            /* مرجوعیِ نقد/کارت: کالا برگشته ولی بدهی عوض نشده — عمداً جدا. */
            return (
              <span
                key={item.key}
                className={`${infoChip} text-muted-foreground`}
                title={`${faDateTime(item.at)} — وجه از صندوق برگشت، روی حساب اثری ندارد`}
              >
                مرجوعی {toFa(item.refund.number)} · {shortJalaliDate(item.at)} ·{" "}
                <b className="tabular-nums">−{money(item.refund.amount)}</b> (
                {PAYMENT_LABELS[item.refund.method] ?? item.refund.method} — از
                حساب کم نشد)
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
