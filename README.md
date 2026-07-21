# warehouse-os

سیستم انبارداری هوشمند — لوازم یدکی خودرو

## ساختار

```
warehouse-os/
├── apps/
│   ├── api/              NestJS backend
│   └── web/              Next.js admin panel
├── packages/
│   └── shared-types/     DTOهای مشترک
├── prisma/
│   └── schema.prisma
└── docs/task-cards/
```

## راه‌اندازی

```bash
npm install
cp .env.example .env   # DATABASE_URL را پر کنید
npm run db:generate
npm run dev:api        # http://localhost:3000
npm run dev:web        # http://localhost:3001
```

## اسکریپت‌ها

| دستور | توضیح |
|---|---|
| `npm run dev:api` | اجرای NestJS در حالت dev |
| `npm run dev:web` | اجرای Next.js در حالت dev |
| `npm run db:generate` | تولید Prisma Client |
| `npm run db:migrate` | اجرای migration |
| `npm run db:studio` | باز کردن Prisma Studio |

مرجع کامل: [PROJECT_RULES.md](./PROJECT_RULES.md)
