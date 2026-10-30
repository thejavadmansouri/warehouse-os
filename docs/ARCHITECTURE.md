# معماری سامانه و مرزبندی ماژول‌ها (Architecture Specification)
## کاردو B2B — سامانه توزیع عمده قطعات خودرو

---

## ۱. الگوی کلی معماری: Modular Monolith
معماری سیستم بر پایه الگوی **Modular Monolith** با لایه‌بندی DDD (Domain-Driven Design) طراحی شده است. این الگو مزایای زیر را فراهم می‌کند:
1. عدم پیچیدگی ناشی از تأخیر شبکه (Network Latency) در پردازش‌های تراکنشی سنگین مالی و انبارداری.
2. ایزوله‌سازی دقیق ماژول‌ها، به طوری که در صورت نیاز در آینده، هر ماژول به صورت مستقل قابل استخراج به یک میکروسرویس باشد.
3. قابلیت استقرار یکپارچه با Docker روی سرور لینوکس بدون نیاز به کلاسترهای پیچیده Kubernetes.

```
kardo-b2b/
├── src/
│   ├── app/                     # لایه Presentation & Routing (Next.js App Router)
│   │   ├── (customer)/          # صفحات مشتری: کاتالوگ، سفارش‌ها، کیف پول، استعلام
│   │   ├── admin/               # صفحات مدیریت: سفارش‌ها، مشتریان، انبار، ورود گروهی
│   │   ├── invoice/[token]/     # برگه فاکتور رسمی استاندارد A4 چاپی
│   │   └── api/                 # REST API Endpoints تفکیک‌شده بر اساس دامنه‌ها
│   │
│   ├── modules/                 # دامنه‌های اصلی تجاری (Domain Core Modules)
│   │   ├── identity/            # مدیریت هویت، مشتریان و سطوح دسترسی
│   │   ├── catalog/             # کاتالوگ قطعات، کدهای فنی، پارت‌برند و خودروها
│   │   ├── pricing/             # موتور قیمت‌گذاری پلکانی، طبقات و تخفیف‌ها
│   │   ├── inventory/           # انبارداری، قفل رزرو کالا و بررسی ضرایب کارتن
│   │   ├── orders/              # موتور پردازش سفارش، پیش‌فاکتور و فاکتور
│   │   ├── financial/           # کیف پول، اعتبارات، چک‌های صیادی و درگاه
│   │   ├── rfq/                 # استعلام چندردیفی قیمت
│   │   └── import-center/       # پردازش گروهی اکسل و اعتبارسنجی ۱۰,۰۰۰ کالا
│   │
│   ├── lib/                     # ابزارهای مشترک و زیرساخت (Prisma, Digits, Date, Status)
│   └── components/              # اجزای رابط کاربری واکنش‌گرا و Mobile-First
```

---

## ۲. پشته فناوری (Technology Stack)

- **زبان و فریم‌ورک اصلی:** TypeScript 5.x با حالت Strict فعال در سراسر پروژه.
- **فریم‌ورک فرانت‌اند و API:** Next.js (App Router, Turbopack, React 19).
- **پایگاه داده رابطه‌ای:** PostgreSQL 16+ به عنوان مخزن اصلی حقایق (Single Source of Truth).
- **لایه دسترسی به داده (ORM):** Prisma ORM با پشتیبانی از کلاینت‌های جنریت‌شده بومی و مهاجرت‌های ساختاریافته (Prisma Migrate).
- **سیستم مدیریت صف و کارهای پس‌زمینه (Background Jobs):** BullMQ با ذخیره‌سازی Redis برای پردازش ایمپورت‌های حجیم، آزادسازی رزرواسیون‌های منقضی و ارسال پیامک‌ها.
- **موتور جستجوی تخصصی:** Meilisearch برای فیلترهای چندبعدی Faceted، جستجوی همزمان کدهای فنی، OEM و نام قطعات با پشتیبانی کامل از نرمال‌سازی حروف فارسی.
- **سیستم طراحی (Design System):** Tailwind CSS با متغیرهای طراحی صنعتی و استاندارد ارگونومی لمسی موبایل.

---

## ۳. جریان داده و ایزولاسیون تراکنش‌ها (Data Flow & Concurrency Control)

### ۳.۱. جلوگیری از بیش‌فروشی موجودی انبار
کلیه رزروهای موجودی در قالب یک تراکنش بدبینانه دیتابیس اجرا می‌شوند:
```typescript
await prisma.$transaction(async (tx) => {
  // ۱. بررسی موجودی قابل فروش با قفل ردیف
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { stockQty: true, reservedQty: true, packSize: true }
  });

  // ۲. اعتبارسنجی ضریب بسته‌بندی
  if (requestedQty % product.packSize !== 0) {
    throw new BusinessRuleError("تعداد انتخابی باید مضرب بسته باشد");
  }

  // ۳. محاسبه موجودی آزاد
  const available = product.stockQty - product.reservedQty;
  if (available < requestedQty) {
    throw new InsufficientStockError("موجودی انبار مرکزی کسری دارد");
  }

  // ۴. افزایش موجودی رزرو شده
  await tx.product.update({
    where: { id: productId },
    data: { reservedQty: { increment: requestedQty } }
  });
});
```

### ۳.۲. تراکنش‌های مالی و تغییرناپذیری (Immutable Financial Ledger)
- هرگز رکورد موجودی یا تراکنش مالی مشتری بازنویسی (Overwrite) نمی‌شود.
- کلیه تغییرات مالی از طریق جدول `WalletTransaction` با انواع `DEPOSIT` (شارژ درگاه)، `ORDER_PAYMENT` (پرداخت فاکتور)، `ORDER_REFUND` (مرجوعی) و `ADMIN_ADJUSTMENT` (اصلاح مالی با یادداشت رسمی) به صورت تغییرناپذیر ثبت و نگهداری می‌شوند.
