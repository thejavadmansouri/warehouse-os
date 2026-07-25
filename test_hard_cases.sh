#!/usr/bin/env bash
# ==========================================================================
# تست end-to-end بک‌اند انبار هوشمند از ترمینال (نسخه نهایی با SKU یکتا)
# ==========================================================================

set -e
BASE_URL="http://127.0.0.1:3000"

echo "== ۱) لاگین با ادمین =="
ADMIN_USER="admin"
ADMIN_PASS="123456"

LOGIN_RES=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

TOKEN=$(echo "$LOGIN_RES" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ لاگین ناموفق بود:"
  echo "$LOGIN_RES" | jq .
  exit 1
fi
echo "✅ لاگین موفق."
AUTH="Authorization: Bearer $TOKEN"

echo
echo "== ۲) ساخت نوع موقعیت (SHELF) =="
LOC_TYPE_RES=$(curl -s -X POST "$BASE_URL/location-types" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"قفسه تستی","level":"SHELF"}')
TYPE_ID=$(echo "$LOC_TYPE_RES" | jq -r '.id')
echo "TypeId: $TYPE_ID"

echo
echo "== ۳) ساخت یک قفسه/موقعیت =="
LOC_RES=$(curl -s -X POST "$BASE_URL/locations" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"قفسه تست A1\",\"typeId\":\"$TYPE_ID\"}")
LOCATION_BARCODE=$(echo "$LOC_RES" | jq -r '.barcode')
echo "بارکد قفسه: $LOCATION_BARCODE"

echo
echo "== ۴) خواندن برند و مدل خودرو از داده‌های seed شده =="
BRAND_ID=$(curl -s "$BASE_URL/brands" -H "$AUTH" | jq -r '.[0].id')
VEHICLE_ID=$(curl -s "$BASE_URL/vehicle-models" -H "$AUTH" | jq -r '.[0].id')
BRAND_NAME=$(curl -s "$BASE_URL/brands" -H "$AUTH" | jq -r '.[0].name')
VEHICLE_NAME=$(curl -s "$BASE_URL/vehicle-models" -H "$AUTH" | jq -r '.[0].name')
echo "برند تستی: $BRAND_NAME | مدل خودرو تستی: $VEHICLE_NAME"

echo
echo "== ۵) ساخت یک محصول استاندارد با SKU یکتا =="
DYNAMIC_SKU="TEST-SKU-$(date +%s)"
PRODUCT_RES=$(curl -s -X POST "$BASE_URL/products" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"لنت ترمز جلو\",\"sku\":\"$DYNAMIC_SKU\",\"unit\":\"عدد\",\"brandId\":\"$BRAND_ID\",\"vehicleModelId\":\"$VEHICLE_ID\"}")
PRODUCT_ID=$(echo "$PRODUCT_RES" | jq -r '.id')
echo "ProductId: $PRODUCT_ID"

echo
echo "== ۶) شروع سشن انبارگردانی =="
SESSION_RES=$(curl -s -X POST "$BASE_URL/inventory-session/start" \
  -H "$AUTH" -H "Content-Type: application/json" -d '{}')
SESSION_ID=$(echo "$SESSION_RES" | jq -r '.id')
echo "SessionId: $SESSION_ID"

VOICE_TEXT="لنت ترمز جلو $BRAND_NAME $VEHICLE_NAME 5 عدد"
echo
echo "== ۷) تست ورود صوتی اصلی: POST /inventory/voice =="
echo "متن: $VOICE_TEXT"
VOICE_RES=$(curl -s -X POST "$BASE_URL/inventory/voice" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"locationBarcode\":\"$LOCATION_BARCODE\",\"text\":\"$VOICE_TEXT\",\"sessionId\":\"$SESSION_ID\"}")
echo "$VOICE_RES" | jq .

echo
echo "== ۸) چک موجودی بعد از ثبت صوتی =="
curl -s "$BASE_URL/inventory/current-stock" -H "$AUTH" | jq '.data[] | select(.productId=="'"$PRODUCT_ID"'")'

echo
echo "== ۹) تست مسیر دوم صوتی (شمارش/انبارگردانی) =="
COUNT_START_RES=$(curl -s -X POST "$BASE_URL/mobile/count/start" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"locationBarcode\":\"$LOCATION_BARCODE\"}")
COUNT_ID=$(echo "$COUNT_START_RES" | jq -r '.countId')

curl -s -X POST "$BASE_URL/mobile/count/$COUNT_ID/voice" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"text\":\"$VOICE_TEXT\"}" | jq .

echo
echo "== ۱۰) تست خروج بیشتر از موجودی (باید رد بشه) =="
curl -s -X POST "$BASE_URL/inventory/out" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"locationId\":\"$(echo $LOC_RES | jq -r .id)\",\"quantity\":99999}" | jq .

echo
echo "== ۱۱) تست session نامعتبر (باید رد بشه) =="
curl -s -X POST "$BASE_URL/inventory/voice" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"locationBarcode\":\"$LOCATION_BARCODE\",\"text\":\"$VOICE_TEXT\",\"sessionId\":\"fake-session-id-12345\"}" | jq .

echo "تست تمام شد ✅"