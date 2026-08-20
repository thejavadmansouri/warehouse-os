"use client";

/**
 * استایلِ مشترکِ همه‌ی برگه‌های چاپی.
 *
 * جدا شد چون پیش‌فاکتور باید دقیقاً همان قالبِ فاکتور را داشته باشد. اگر کپی
 * می‌شد، اولین تغییر در حاشیه یا فونت روی یکی اعمال می‌شد و روی آن یکی نه — و
 * دو برگه‌ای که کنار هم روی پیشخوان می‌نشینند دو شکل می‌شدند.
 */
export type PaperSize = "a4" | "a5";

export function PrintStyles({ size }: { size: PaperSize }) {
  return (
    <>
      <style jsx global>{`
        :root {
          color-scheme: light;
        }
        html,
        body {
          margin: 0;
          padding: 0;
          background: #f1f5f9;
        }

        .sheet {
          position: relative;
          margin: 16px auto;
          background: #fff;
          color: #000;
          /* نامِ دقیقِ @font-face در globals.css «Vazirmatn Variable» است؛
             «Vazirmatn» بدون Variable با هیچ فونتِ وب‌فونتی تطبیق نمی‌خورد و روی
             ماشینِ مشتری به Tahoma می‌افتاد. */
          font-family: "Vazirmatn Variable", Tahoma, sans-serif;
          /* وزن ۵۰۰ بدنه: در چاپِ جوهر، وزن ۴۰۰ کم‌رنگ دیده می‌شود. */
          font-weight: 500;
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
        }
        .sheet.a4 {
          width: 210mm;
          min-height: 297mm;
          padding: 14mm;
          font-size: 13px;
        }
        .sheet.a5 {
          width: 148mm;
          min-height: 210mm;
          padding: 10mm;
          font-size: 11.5px;
        }

        .void {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          font-size: 48px;
          font-weight: 800;
          color: rgba(220, 38, 38, 0.18);
          transform: rotate(-20deg);
          pointer-events: none;
        }

        .head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 3mm;
        }
        .title {
          font-size: 1.6em;
          font-weight: 800;
        }
        .meta td {
          padding: 0 4px;
        }

        .party {
          display: flex;
          gap: 6mm;
          flex-wrap: wrap;
          padding: 3mm 0;
          border-bottom: 1px solid #cbd5e1;
        }

        .items {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4mm;
        }
        .items th,
        .items td {
          border: 1px solid #94a3b8;
          padding: 1.6mm 2mm;
          text-align: start;
          vertical-align: top;
        }
        .items th {
          background: #e2e8f0;
          font-weight: 700;
        }
        .w-row {
          width: 10mm;
        }
        .w-qty {
          width: 18mm;
        }
        .w-price {
          width: 24mm;
        }
        .sku {
          font-size: 0.85em;
        }

        .totals {
          display: flex;
          margin-top: 4mm;
        }
        .totals table {
          border-collapse: collapse;
          min-width: 70mm;
        }
        .totals td {
          padding: 1.2mm 3mm;
        }
        .grand td {
          border-top: 2px solid #000;
          font-size: 1.25em;
          font-weight: 800;
          padding-top: 2mm;
        }
        .due td {
          color: #b45309;
          font-weight: 700;
        }

        .pay,
        .note {
          margin-top: 3mm;
        }

        .sign {
          display: flex;
          justify-content: space-between;
          margin-top: 12mm;
          padding-top: 3mm;
        }
        .sign div {
          width: 45%;
          border-top: 1px dotted #64748b;
          padding-top: 2mm;
          text-align: center;
        }

        .num {
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .center {
          text-align: center;
        }
        .strong {
          font-weight: 700;
        }
        .muted {
          color: #475569;
        }

        /* اعتبارِ نرم‌افزار، گوشه‌ی پایین‌چپ — عمداً ریز و کم‌رنگ تا شبیه
           تبلیغ نشود و حواس از محتوای رسمی برگه پرت نشود. */
        .credit {
          position: absolute;
          bottom: 3mm;
          left: 8mm;
          font-size: 7px;
          font-weight: 400;
          color: #94a3b8;
        }

        @media print {
          html,
          body {
            background: #fff;
          }
          /* هر چیزی جز خود برگه نباید روی کاغذ بیاید. */
          .no-print {
            display: none !important;
          }
          /*
            حاشیه‌ی کاغذ صفر می‌شود و فاصله از خودِ برگه می‌آید.

            دلیلش سربرگ و پاورقیِ خودِ مرورگر است (تاریخ، عنوان صفحه، آدرس،
            شماره‌ی صفحه). تا وقتی @page حاشیه داشته باشد، مرورگر آن‌ها را
            داخل همان حاشیه چاپ می‌کند و روی برگه‌ی فروشگاهی می‌نشیند.
          */
          .sheet {
            margin: 0 !important;
            box-shadow: none !important;
            /* ارتفاع ثابت نه: محتوای بلندتر باید طبیعی به صفحه‌ی بعد برود،
               نه اینکه بریده شود. */
            min-height: 0 !important;
            width: 100% !important;
          }
          .items th {
            /* بدون این، پس‌زمینه‌ی سرستون چاپ نمی‌شود و جدول بی‌سر می‌ماند. */
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* ردیف جدول وسطِ دو صفحه نصف نشود. */
          .items tr,
          .totals,
          .sign {
            break-inside: avoid;
          }
        }
      `}</style>

      {/*
        اندازه‌ی @page را نمی‌شود با متغیر CSS عوض کرد، پس برای هر اندازه یک
        قاعده‌ی جدا تزریق می‌شود. بدون این، مرورگر A4 فرض می‌کند و برگه‌ی A5
        وسط یک برگ بزرگ چاپ می‌شود — و اگر محتوا کمی بلند شود، به صفحه‌ی دوم
        سرریز می‌کند.
      */}
      <style jsx global>{`
        @page {
          size: ${size === "a4" ? "A4" : "A5"} portrait;
          /*
            حاشیه صفر عمدی است. با هر حاشیه‌ای، مرورگر تاریخ و آدرس و شماره‌ی
            صفحه را همان‌جا چاپ می‌کند. فاصله‌ی واقعی از padding خودِ .sheet
            می‌آید.
          */
          margin: 0;
        }
      `}</style>
    </>
  );
}
