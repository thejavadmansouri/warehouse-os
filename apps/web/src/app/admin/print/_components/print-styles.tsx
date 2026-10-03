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
        /*
          چیدمانِ فشرده: حاشیه و فونت جمع‌وجور شد تا ۲۰ تا ۳۰ قلم روی یک صفحه
          بنشیند. هر ۰٫۵px فونت یا ۰٫۲mm پدینگ در ردیفِ جدول ضرب می‌شود — روی
          فاکتورِ بلند، همین تفاوتِ کوچک یک صفحه‌ی کامل صرفه‌جویی می‌کند.
        */
        .sheet.a4 {
          width: 210mm;
          min-height: 297mm;
          padding: 8mm;
          font-size: 11px;
        }
        .sheet.a5 {
          width: 148mm;
          min-height: 210mm;
          padding: 7mm;
          font-size: 10px;
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

        /*
          سربرگ: فروشگاه سمت راست، مشخصاتِ فاکتور و خریدار سمت چپ — یک نوار
          به‌جای سه بلوکِ پشتِ‌سرِهم. عنوان هم از 1.6em به 1.25em آمد؛ روی
          برگه‌ای که مشتری می‌گیرد، «فاکتور فروش» را از دور هم می‌خواند.
        */
        .head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 6mm;
          border-bottom: 1.5px solid #000;
          padding-bottom: 1.8mm;
        }
        .title {
          font-size: 1.05em;
          font-weight: 800;
        }
        .head-meta {
          text-align: end;
          line-height: 1.45;
        }

        .items {
          width: 100%;
          border-collapse: collapse;
          margin-top: 2mm;
        }
        .items th,
        .items td {
          border: 1px solid #94a3b8;
          padding: 0.9mm 1.4mm;
          text-align: start;
          vertical-align: top;
          line-height: 1.35;
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
          font-size: 0.8em;
        }
        /* توضیحِ قلم — خطِ دوم، ریزتر و کم‌رنگ‌تر از نامِ کالا. */
        .line-note {
          font-size: 0.8em;
          color: #475569;
          margin-top: 0.3mm;
        }

        .totals {
          display: flex;
          margin-top: 2mm;
        }
        .totals table {
          border-collapse: collapse;
          min-width: 62mm;
        }
        .totals td {
          padding: 0.7mm 2mm;
          line-height: 1.35;
        }
        .grand td {
          border-top: 1.5px solid #000;
          font-size: 1.05em;
          font-weight: 800;
          padding-top: 1mm;
        }
        .due td {
          color: #b45309;
          font-weight: 700;
        }

        /*
          پای برگه یک ردیفِ دوستونه است: چپ اطلاعاتِ پرداخت و بانک، راست
          امضاها. قبلاً چهار بلوکِ پشتِ‌سرِهم بود و ۱۲ میلی‌متر فاصله‌ی
          خالی هم بالای امضاها داشت — روی A5 همین برگه را به صفحه‌ی دوم
          می‌برد حتی با شش قلم.
        */
        .foot {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 6mm;
          margin-top: 2.5mm;
        }
        .foot-col {
          flex: 1;
          min-width: 0;
          line-height: 1.4;
        }
        .foot-sign {
          display: flex;
          gap: 5mm;
          flex-shrink: 0;
        }
        .foot-sign div {
          width: 28mm;
          border-top: 1px dotted #64748b;
          padding-top: 1mm;
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
          .foot {
            break-inside: avoid;
          }
          /*
            سرستون‌ها روی هر صفحه تکرار شوند.

            فاکتورِ ۵۰ قلمی دو-سه صفحه می‌شود و تا حالا صفحه‌ی دوم بی‌سر بود:
            ستونی که مشتری می‌بیند معلوم نبود «قیمت واحد» است یا «مبلغ».
          */
          .items thead {
            display: table-header-group;
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
