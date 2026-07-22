# Warehouse OS

سیستم هوشمند مدیریت انبار، مخصوص قطعات یدکی و قابل توسعه برای سایر اصناف.

هدف پروژه ساخت یک پلتفرم مدرن مدیریت موجودی است که بتواند:

* مدیریت کالاها
* مدیریت موقعیت‌های انبار
* ثبت ورود و خروج کالا
* انتقال بین قفسه‌ها
* ثبت عملیات انبار با Barcode
* ثبت موجودی با Voice
* اتصال به نرم‌افزارهای حسابداری
* توسعه برای فروشگاه آنلاین و اپلیکیشن موبایل

را در یک معماری قابل توسعه ارائه کند.

---

# Tech Stack

## Backend

* NestJS
* TypeScript
* Prisma ORM
* PostgreSQL

## Architecture

Modular Monolith با قابلیت تبدیل به Microservice در آینده.

ساختار:

```
warehouse-os
│
├── apps
│   └── api
│       └── NestJS Backend
│
├── prisma
│   └── Database Schema
│
└── packages
    └── Shared Components
```

---

# Current Modules

## Authentication

مسئولیت:

* کاربران
* نقش‌ها
* دسترسی‌ها

Roles:

* ADMIN
* MANAGER
* STAFF

---

## Products

مدیریت کالا:

* نام کالا
* SKU
* بارکد داخلی
* بارکد کارخانه
* Part Number
* برند
* مدل خودرو
* تصویر کالا

نمونه:

```
لنت ترمز پراید
Brand: TEXTAR
Barcode: WOS000000001
```

---

## Locations

مدیریت مکان‌های انبار:

مثال:

```
انبار
 |
 ├── راهرو A
      |
      ├── قفسه A1
      └── قفسه A2
```

هر موقعیت دارای:

* نام
* Barcode
* نوع موقعیت
* Parent Location

---

# Inventory Engine

هسته اصلی کنترل موجودی.

قابلیت‌ها:

## ورود کالا

```
IN
```

مثال:

```
لنت پراید تکستار
تعداد: 40
مکان: A1
```

---

## خروج کالا

```
OUT
```

---

## فروش

```
SALE
```

---

## انتقال

```
TRANSFER
```

مثال:

```
A1 → A2
تعداد: 5
```

---

# Barcode System

سیستم بارکد شامل:

## Product Barcode

فرمت:

```
WOS000000001
```

## Location Barcode

فرمت:

```
LOC000001
```

---

Workflow:

```
Scan Product
        |
        |
Scan Location
        |
        |
Inventory Operation
        |
        |
Update Stock
        |
        |
Create Log
```

---

# Inventory Logs

تمام عملیات انبار ذخیره می‌شوند:

انواع عملیات:

```
IN
OUT
SALE
TRANSFER
RETURN
ADJUST
COUNT
```

هر Log شامل:

* محصول
* مکان
* مقدار
* نوع عملیات
* کاربر
* Session
* زمان

---

# Voice Inventory Pipeline

سیستم ثبت موجودی صوتی:

مثال:

```
لنت پراید تکستار چهل عدد
```

Pipeline:

```
Voice
 |
Speech To Text
 |
Product Matching
 |
Brand Detection
 |
Vehicle Matching
 |
Inventory Operation
 |
Database
```

وضعیت:

✅ Voice endpoint ساخته شده
✅ تبدیل صدا به عملیات انبار فعال است

---

# API Examples

## Barcode Scan

Endpoint:

```
POST /barcode/scan
```

Request:

```json
{
 "barcode":"WOS000000001",
 "locationBarcode":"LOC000002",
 "action":"IN",
 "quantity":5
}
```

Response:

```json
{
 "success":true,
 "operation":"IN",
 "product":"لنت ترمز پراید",
 "location":"قفسه A2",
 "quantity":5,
 "newStock":32
}
```

---

# Database Models

مدل‌های اصلی:

```
Product

Brand

VehicleModel

Location

LocationType

Inventory

InventoryLog

InventorySession

User
```

---

# Current Development Status

## Completed

✅ Monorepo setup

✅ Prisma database

✅ Product model

✅ Brand management

✅ Vehicle models

✅ Location system

✅ Barcode generation

✅ Barcode scanning

✅ Inventory Engine

✅ Inventory IN/OUT

✅ SALE operation

✅ Inventory Transfer

✅ Inventory Logs

✅ Voice inventory pipeline

---

# Next Roadmap

## Phase 1

Warehouse Management

* Inventory counting
* Stock reports
* Low stock alerts
* Advanced search

## Phase 2

Hardware Integration

* Barcode scanner
* Label printer
* Mobile warehouse app

## Phase 3

AI Features

* Voice continuous mode
* Smart product matching
* Image recognition
* OCR invoice reading

## Phase 4

Business Integration

* Accounting software API
* Online store integration
* Sales management

---

# Development Commands

Install:

```
npm install
```

Database:

```
npx prisma migrate dev
```

Run:

```
npm run start:dev
```

---

# Project Vision

Warehouse OS قرار است تبدیل به یک سیستم مدیریت هوشمند کسب‌وکار شود که فقط محدود به لوازم یدکی نیست و قابلیت استفاده در صنایع مختلف مانند:

* قطعات خودرو
* ابزار
* پوشاک
* دارو
* فروشگاه‌ها
* عمده‌فروشی‌ها

را داشته باشد.

---

# Version

Current:

```
v0.4
Inventory Core + Barcode + Transfer + Logs
```

