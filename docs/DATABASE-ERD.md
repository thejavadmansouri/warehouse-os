# مدل داده و دیاگرام موجودیت‌ها (Database ERD & Schema)
## پایگاه داده رابطه‌ای PostgreSQL سامانه کاردو B2B

---

## ۱. دیاگرام روابط موجودیت‌ها (Entity Relationship Diagram)

```mermaid
erDiagram
    User ||--o{ BusinessCustomer : "مدیریت / عضویت"
    CustomerTier ||--o{ BusinessCustomer : "تخصیص سطح تخفیف"
    BusinessCustomer ||--o{ Order : "ثبت سفارش / پیش‌فاکتور"
    BusinessCustomer ||--o{ Inquiry : "ثبت استعلام چندردیفی"
    BusinessCustomer ||--o{ WalletTransaction : "گردش حساب کیف پول"
    BusinessCustomer ||--o{ Cheque : "ثبت و تحویل چک صیادی"
    
    Order ||--|{ OrderItem : "اقلام سفارش"
    Order }o--|| ShippingMethod : "روش ارسال باربری"
    OrderItem }o--|| Product : "کالای سفارش داده شده"
    
    Inquiry ||--|{ InquiryItem : "ردیف‌های استعلام"
    Inquiry ||--o| Order : "تبدیل به پیش‌فاکتور"
    
    Product ||--o{ VolumePrice : "پلکان تخفیف تیراژ"
    Product ||--o{ ProductFitment : "انطباق با خودرو"
    ProductFitment }o--|| VehicleModel : "مدل خودرو"
    
    ImportJob ||--o{ ImportError : "لاگ خطاهای ردیف‌ها"

    User {
        string id PK
        string username
        string phone
        string role "ADMIN | CUSTOMER"
        datetime createdAt
    }

    BusinessCustomer {
        string id PK
        string userId FK
        string companyName
        string contactName
        string phone
        string nationalId
        string economicCode
        string address
        string city "Kerman | Sirjan | Bam..."
        string status "PENDING | ACTIVE | SUSPENDED"
        bigint creditLimit "ریال"
        bigint availableCredit "ریال"
        datetime createdAt
    }

    Product {
        string id PK
        string sku UK "کد فنی"
        string oemCode "کد بین‌المللی"
        string name "شرح کالا"
        string brand "برند خودرو"
        string model "مدل خودرو"
        string category "سیستم/بخش فنی"
        string partBrand "برند سازنده قطعه"
        int stockQty "موجودی کل"
        int reservedQty "موجودی رزرو"
        int packSize "ضریب بسته"
        bigint costPrice "قیمت خرید"
        bigint priceBefore "قیمت پایه"
        bigint partnerPrice "قیمت همکاری"
        boolean active
    }

    VolumePrice {
        string id PK
        string productId FK
        int qtyFrom "حداقل تعداد"
        int discountPercent "درصد تخفیف"
    }

    Order {
        string id PK
        string number UK "PF-1405-XXXX / INV-..."
        string customerId FK
        string status "PROFORMA | PAID | AWAITING_CREDIT | CANCELLED"
        bigint subtotal
        bigint discountTotal
        bigint shippingCost
        bigint total
        bigint paidWallet
        bigint paidGateway
        bigint creditAmount
        datetime creditDueAt
        string publicToken UK
        datetime expiresAt "انقضای رزرو ۲۴ساعته"
    }

    OrderItem {
        string id PK
        string orderId FK
        string productId FK
        string sku
        string name
        int qty
        bigint unitPrice
        bigint lineTotal
    }

    Cheque {
        string id PK
        string customerId FK
        string chequeNumber "شماره صیادی ۱۶ رقمی"
        string bankName "نام بانک"
        bigint amount "مبلغ چک"
        date dueDate "تاریخ سررسید"
        string status "RECEIVED | REGISTERED | CLEARED | BOUNCED"
        string imagePath
    }
```

---

## ۲. ایندکس‌های تخصصی پایگاه داده برای مقیاس‌پذیری (Indexing Strategy)
برای تضمین سرعت پاسخگویی زیر ۱۰۰ میلی‌ثانیه برای ۱۰ تا ۵۰ هزار قطعه:
1. `CREATE INDEX idx_products_sku ON "Product" ("sku");` — جستجوی فوری با کد فنی و بارکد.
2. `CREATE INDEX idx_products_fitment ON "Product" ("brand", "model", "category");` — فیلترهای چندبعدی ترکیبی.
3. `CREATE INDEX idx_products_part_brand ON "Product" ("partBrand");` — فیلتر تفکیکی پارت‌برند (ایساکو، عظام، والئو).
4. `CREATE INDEX idx_orders_customer_status ON "Order" ("customerId", "status");` — واکشی سریع فاکتورهای هر مشتری.
5. `CREATE INDEX idx_orders_expires_at ON "Order" ("expiresAt") WHERE "status" = 'PROFORMA';` — روبش خودکار و آزادسازی پیش‌فاکتورهای منقضی توسط Worker پس‌زمینه.
