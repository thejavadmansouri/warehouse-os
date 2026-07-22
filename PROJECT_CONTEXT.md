# Warehouse OS

## هدف پروژه

Warehouse OS یک سیستم مدیریت انبار حرفه‌ای است که ابتدا برای فروشگاه‌های لوازم یدکی خودرو توسعه داده می‌شود اما معماری آن به گونه‌ای طراحی شده که برای هر صنف دیگری نیز قابل استفاده باشد.

---

## Tech Stack

- NestJS
- Prisma ORM
- PostgreSQL
- Android
- React (Dashboard)
- REST API

---

## Modules

- Authentication
- Users
- Warehouse
- Location
- Product
- Category
- Brand
- Supplier
- Inventory
- InventoryLog
- Barcode
- Voice Inventory
- Image Upload
- Accounting (Future)

---

## قوانین پروژه

- موجودی فقط داخل Inventory ذخیره می‌شود.
- Product هیچ quantity ندارد.
- تمام تغییرات موجودی فقط از InventoryOperation انجام می‌شود.
- تمام عملیات باید InventoryLog تولید کنند.
- تصاویر روی هارد سرور ذخیره می‌شوند.
- حذف رکوردها به صورت Soft Delete است.

---

## وضعیت فعلی

✅ Inventory Engine

✅ Barcode

✅ Transfer

✅ Voice MVP

✅ Supplier Foundation

✅ Warehouse Foundation

---

## Roadmap

v0.4 Authentication

v0.5 Image Upload

v0.6 Android

v0.7 Dashboard

v0.8 Accounting