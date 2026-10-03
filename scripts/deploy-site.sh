#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# deploy-site.sh — ساخت و اجرای سمتِ سایت (VPS)
#
# این اسکریپت فقط سمتِ «سایت» را آماده می‌کند: API با نقشِ site + اپِ سایت.
# سمتِ مغازه (انبار) دست نمی‌خورد و باید جدا deploy شود.
#
# پیش‌نیازها:
#   - Node.js + npm
#   - یک دیتابیس برای سایت (می‌تواند همان اسکیمای پروژه باشد)
#   - SYNC_SECRET (حداقل ۳۲ کاراکتر) — باید با سمتِ انبار یکی باشد
#
# متغیرهای محیطی (می‌توانید با env بدهید یا در .env بگذارید):
#   SITE_PORT        پورت API سایت            (پیش‌فرض: 3010)
#   WEB_PORT         پورت اپِ سایت            (پیش‌فرض: 3002)
#   DATABASE_URL     رشته‌ی اتصال دیتابیس سایت
#   SYNC_SECRET      کلید مشترک سینک با انبار
#   JWT_SECRET       کلید امضای توکن
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_PORT="${SITE_PORT:-3010}"
WEB_PORT="${WEB_PORT:-3002}"

echo "▶ ریشه: $ROOT"

# 1) وابستگی‌ها (در صورت نیاز)
if [ ! -d "$ROOT/node_modules" ]; then
  echo "▶ نصب وابستگی‌ها..."
  (cd "$ROOT" && npm install)
fi

# 2) build API (هر دو نقش یک build دارند؛ نقش با env مشخص می‌شود)
echo "▶ ساخت API..."
(cd "$ROOT/apps/api" && npm run build)

# 3) ساخت اپِ سایت
echo "▶ ساخت اپِ سایت..."
(cd "$ROOT/apps/site" && npm run build)

# 4) اجرای API با نقشِ سایت
echo "▶ اجرای API (نقش site) روی پورت $SITE_PORT ..."
(
  cd "$ROOT/apps/api"
  export APP_ROLE=site
  export SYNC_ROLE=site
  export PORT="$SITE_PORT"
  exec node dist/main
) &
API_PID=$!

# 5) اجرای اپِ سایت
echo "▶ اجرای اپِ سایت روی پورت $WEB_PORT ..."
(
  cd "$ROOT/apps/site"
  export NEXT_PUBLIC_SITE_API_PORT="$SITE_PORT"
  exec npm run start
) &
WEB_PID=$!

echo ""
echo "✅ سمتِ سایت بالا آمد:"
echo "   API سایت : http://localhost:$SITE_PORT"
echo "   اپِ سایت : http://localhost:$WEB_PORT"
echo ""
echo "برای متوقف‌کردن: kill $API_PID $WEB_PID"
echo ""
echo "⚠️ یادآوری:"
echo "   - در سمتِ انبار باید SYNC_ROLE=warehouse و SITE_URL این سرور تنظیم شود."
echo "   - فروشگاه باید در پنلِ انبار روشن شود تا کاتالوگ سینک شود."
