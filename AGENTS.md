# کاردو = Warehouse OS

Alias: کاردو / Kardo / kardo → this monorepo. **Not WordPress.**

## Paths
| Role | Path |
|------|------|
| Source | `C:\warehouse-os` |
| Production | `C:\WarehouseOS` |
| Update kit | `C:\Users\K\Desktop\kardo-update-v2` |

## Stack
- `apps/api` — NestJS `:3000`
- `apps/web` — Next.js `:3001`
- PostgreSQL + Prisma (`warehouse_os`)
- `apps/desktop` — Tauri seller
- `apps/android` — operator app

## Deploy / host
Node + Postgres (VPS / PaaS). Never WordPress shared hosting.

## Start
`C:\warehouse-os\start-dev-stack.ps1`
