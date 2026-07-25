#!/usr/bin/env bash
set -e
BASE_URL="http://127.0.0.1:3000"
PASS=0; FAIL=0
ok(){ echo "OK: $1"; PASS=$((PASS+1)); }
bad(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }

echo "== 1) login admin =="
read -p "username [admin]: " ADMIN_USER; ADMIN_USER=${ADMIN_USER:-admin}
read -sp "password: " ADMIN_PASS; echo
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" | jq -r '.access_token')
[ "$TOKEN" != "null" ] && [ -n "$TOKEN" ] && ok "login" || { bad "login"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

echo; echo "== 2) base data: location-type, location, brand, vehicle-model, product =="
TYPE_ID=$(curl -s -X POST "$BASE_URL/location-types" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"test shelf","level":"SHELF"}' | jq -r '.id')
[ "$TYPE_ID" != "null" ] && ok "location-type created" || bad "location-type"

LOC_RES=$(curl -s -X POST "$BASE_URL/locations" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"test shelf A1\",\"typeId\":\"$TYPE_ID\"}")
LOCATION_ID=$(echo "$LOC_RES" | jq -r '.id')
LOCATION_BARCODE=$(echo "$LOC_RES" | jq -r '.barcode')
[ "$LOCATION_ID" != "null" ] && ok "location created ($LOCATION_BARCODE)" || bad "location"

TS=$(date +%s)
BRAND_RES=$(curl -s -X POST "$BASE_URL/brands" -H "$AUTH" -H "Content-Type: application/json" -d "{\"name\":\"test brand $TS\"}")
BRAND_ID=$(echo "$BRAND_RES" | jq -r '.id')
[ "$BRAND_ID" != "null" ] && ok "brand created" || bad "brand"

VEHICLE_RES=$(curl -s -X POST "$BASE_URL/vehicle-models" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"test vehicle $TS\",\"startYear\":2015,\"endYear\":2023}")
VEHICLE_ID=$(echo "$VEHICLE_RES" | jq -r '.id')
[ "$VEHICLE_ID" != "null" ] && ok "vehicle-model created" || bad "vehicle-model"

PRODUCT_RES=$(curl -s -X POST "$BASE_URL/products" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"test pad $TS\",\"sku\":\"TEST-$TS\",\"brandId\":\"$BRAND_ID\",\"vehicleModelId\":\"$VEHICLE_ID\"}")
PRODUCT_ID=$(echo "$PRODUCT_RES" | jq -r '.id')
[ "$PRODUCT_ID" != "null" ] && ok "product created" || bad "product"

echo; echo "== 3) categories / suppliers (new) =="
curl -s -X POST "$BASE_URL/categories" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"test cat $TS\",\"code\":\"CAT-$TS\"}" | jq -e '.id' >/dev/null && ok "POST /categories" || bad "POST /categories"
curl -s "$BASE_URL/categories" -H "$AUTH" | jq -e 'type=="array"' >/dev/null && ok "GET /categories" || bad "GET /categories"
curl -s -X POST "$BASE_URL/suppliers" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"test supplier $TS\"}" | jq -e '.id' >/dev/null && ok "POST /suppliers" || bad "POST /suppliers"
curl -s "$BASE_URL/suppliers" -H "$AUTH" | jq -e 'type=="array"' >/dev/null && ok "GET /suppliers" || bad "GET /suppliers"

echo; echo "== 4) session + voice entry (transactional) =="
SESSION_ID=$(curl -s -X POST "$BASE_URL/inventory-session/start" -H "$AUTH" -H "Content-Type: application/json" -d '{}' | jq -r '.id')
[ "$SESSION_ID" != "null" ] && ok "session started" || bad "session start"

VOICE_TEXT="test pad $TS 5 units"
VOICE_RES=$(curl -s -X POST "$BASE_URL/inventory/voice" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"locationBarcode\":\"$LOCATION_BARCODE\",\"text\":\"$VOICE_TEXT\",\"sessionId\":\"$SESSION_ID\"}")
echo "$VOICE_RES" | jq -e '.success==true or .needSelection==true' >/dev/null && ok "POST /inventory/voice returned valid response" || bad "POST /inventory/voice"

echo "-- voice/confirm (new) --"
CONFIRM_RES=$(curl -s -X POST "$BASE_URL/inventory/voice/confirm" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"locationBarcode\":\"$LOCATION_BARCODE\",\"quantity\":3,\"sessionId\":\"$SESSION_ID\"}")
echo "$CONFIRM_RES" | jq -e '.success==true' >/dev/null && ok "POST /inventory/voice/confirm" || bad "POST /inventory/voice/confirm"

echo "-- invalid session must be rejected --"
curl -s -X POST "$BASE_URL/inventory/voice" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"locationBarcode\":\"$LOCATION_BARCODE\",\"text\":\"$VOICE_TEXT\",\"sessionId\":\"fake-id-123\"}" \
  | jq -e '.error=="SESSION_NOT_FOUND"' >/dev/null && ok "fake session correctly rejected" || bad "fake session NOT rejected!"

echo; echo "== 5) inventory: check, ADJUST (new), over-limit OUT =="
STOCK=$(curl -s "$BASE_URL/inventory/current-stock" -H "$AUTH" | jq -r --arg pid "$PRODUCT_ID" '.data[] | select(.productId==$pid) | .quantity')
[ -n "$STOCK" ] && ok "current stock for test product: $STOCK" || bad "stock not found"

ADJUST_RES=$(curl -s -X POST "$BASE_URL/inventory/adjust" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"locationId\":\"$LOCATION_ID\",\"targetQuantity\":100}")
echo "$ADJUST_RES" | jq -e '.newQty==100' >/dev/null && ok "POST /inventory/adjust set to 100" || bad "POST /inventory/adjust"

curl -s -X POST "$BASE_URL/inventory/out" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"locationId\":\"$LOCATION_ID\",\"quantity\":99999}" \
  | jq -e '.error=="INSUFFICIENT_STOCK"' >/dev/null && ok "over-limit OUT correctly rejected" || bad "over-limit OUT NOT rejected!"

echo; echo "== 6) both voice paths should agree =="
COUNT_START=$(curl -s -X POST "$BASE_URL/mobile/count/start" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"locationBarcode\":\"$LOCATION_BARCODE\"}")
COUNT_ID=$(echo "$COUNT_START" | jq -r '.countId')
[ "$COUNT_ID" != "null" ] && ok "voice count started" || bad "voice count start"
curl -s -X POST "$BASE_URL/mobile/count/$COUNT_ID/voice" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"text\":\"$VOICE_TEXT\"}" | jq -e '.explanation != null' >/dev/null && ok "voice count returned explanation" || bad "voice count"

echo; echo "== 7) inventory-count: list (new) + create/apply =="
curl -s "$BASE_URL/inventory-count" -H "$AUTH" | jq -e 'type=="array"' >/dev/null && ok "GET /inventory-count (new list)" || bad "GET /inventory-count"

IC_RES=$(curl -s -X POST "$BASE_URL/inventory-count" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"locationId\":\"$LOCATION_ID\"}")
IC_ID=$(echo "$IC_RES" | jq -r '.id')
[ "$IC_ID" != "null" ] && ok "inventory-count created" || bad "inventory-count create"
curl -s -X POST "$BASE_URL/inventory-count/$IC_ID/items" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"productId\":\"$PRODUCT_ID\",\"name\":\"test pad\",\"goodQuantity\":10,\"badQuantity\":1}" \
  | jq -e '.id' >/dev/null && ok "count item added" || bad "count item add"
curl -s -X PATCH "$BASE_URL/inventory-count/$IC_ID/finish" -H "$AUTH" | jq -e '.' >/dev/null && ok "count finished" || bad "count finish"

echo; echo "== 8) label/QR (new) =="
LABEL_LOC=$(curl -s "$BASE_URL/labels/location/$LOCATION_ID" -H "$AUTH")
echo "$LABEL_LOC" | jq -e '.qrCode | startswith("data:image/png")' >/dev/null && ok "GET /labels/location produced QR image" || bad "GET /labels/location"
echo "  pathText: $(echo "$LABEL_LOC" | jq -r '.pathText')"

LABEL_PROD=$(curl -s "$BASE_URL/labels/product/$PRODUCT_ID" -H "$AUTH")
echo "$LABEL_PROD" | jq -e '.qrCode | startswith("data:image/png")' >/dev/null && ok "GET /labels/product produced QR image" || bad "GET /labels/product"

echo; echo "== 9) PATCH brand / vehicle-model (new) =="
curl -s -X PATCH "$BASE_URL/brands/$BRAND_ID" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"test brand edited $TS\"}" | jq -e '.id' >/dev/null && ok "PATCH /brands/:id" || bad "PATCH /brands/:id"
curl -s -X PATCH "$BASE_URL/vehicle-models/$VEHICLE_ID" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"test vehicle edited $TS\",\"startYear\":2016,\"endYear\":2024}" | jq -e '.id' >/dev/null && ok "PATCH /vehicle-models/:id" || bad "PATCH /vehicle-models/:id"

echo; echo "======================================"
echo "RESULT: $PASS passed, $FAIL failed"
echo "======================================"
