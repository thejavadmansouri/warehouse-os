# Architecture

Warehouse
    │
    ├── Location
    │      │
    │      ├── Shelf
    │      ├── Rack
    │      └── Bin
    │
    └── Inventory

Product
     │
     └── InventoryOperation
              │
              ├── IN
              ├── OUT
              ├── SALE
              ├── RETURN
              ├── TRANSFER
              ├── ADJUST
              └── COUNT

InventoryOperation
        │
        └── InventoryLog

Barcode
        │
        └── InventoryOperation

Voice
        │
        └── InventoryOperation

Android
        │
        └── REST API

Accounting
        │
        └── InventoryOperation

---

# Development Rules

Rule 1

هیچ سرویسی به جز InventoryOperation اجازه تغییر موجودی ندارد.

Rule 2

تمام عملیات باید InventoryLog ایجاد کنند.

Rule 3

هیچ Quantity داخل Product وجود ندارد.

Rule 4

تصاویر داخل Database ذخیره نمی‌شوند.

Rule 5

Soft Delete استفاده می‌شود.

Rule 6

تمام عملیات مهم داخل Transaction انجام می‌شوند.

Rule 7

هر Feature جدید باید Migration و Changelog داشته باشد.