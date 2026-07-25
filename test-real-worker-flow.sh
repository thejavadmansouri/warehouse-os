#!/bin/bash

API="http://localhost:3000"

echo "========================================"
echo "REAL WORKER CONTINUOUS INVENTORY TEST"
echo "========================================"

echo
echo "1) LOGIN"
echo "----------------------------------------"

TOKEN=$(curl -s -X POST $API/auth/login \
-H "Content-Type: application/json" \
-d '{"username":"admin","password":"123456"}' | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "LOGIN FAILED"
  exit 1
fi

echo "LOGIN OK"

echo
echo "2) START SESSION"
echo "----------------------------------------"

SESSION=$(curl -s -X POST $API/inventory-session/start \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json" \
-d '{}')

echo $SESSION | jq

SESSION_ID=$(echo $SESSION | jq -r '.id')

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
  echo "SESSION CREATE FAILED"
  exit 1
fi

echo
echo "SESSION ID: $SESSION_ID"

echo
echo "3) ATTACH LOCATION (LOC000002)"
echo "----------------------------------------"

ATTACH=$(curl -s -X POST $API/inventory-session/location \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json" \
-d "{
\"sessionId\":\"$SESSION_ID\",
\"locationBarcode\":\"LOC000002\"
}")

echo $ATTACH | jq

LOCATION_ID=$(echo $ATTACH | jq -r '.location.id')

if [ -z "$LOCATION_ID" ] || [ "$LOCATION_ID" = "null" ]; then
  echo "LOCATION ATTACH FAILED"
  exit 1
fi

echo
echo "LOCATION ID: $LOCATION_ID"

declare -a INPUTS=(
  "سرسیلندر پژو 405 چهل عدد"
  "لنت ترمز جلو پراید تکستار بیست جفت"
  "فیلتر روغن پژو مان پنجاه عدد"
  "تسمه تایم دنا ده عدد"
  "شمع موتور NGK سی عدد"
  "بلبرینگ چرخ جلو پراید KOYO دوازده عدد"
  "دیسک ترمز سمند عظام هشت عدد"
  "واتر پمپ پژو 206 ایساکو شش عدد"
  "کاسه نمد گیربکس پراید چهار عدد"
  "چراغ جلو پژو 405 دو عدد"
)

echo
echo "4) CONTINUOUS VOICE INPUTS"
echo "----------------------------------------"

INDEX=1

for INPUT in "${INPUTS[@]}"; do
  echo
  echo "[$INDEX] $INPUT"

  RESPONSE=$(curl -s -X POST $API/inventory/voice \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
\"locationBarcode\":\"LOC000002\",
\"sessionId\":\"$SESSION_ID\",
\"text\":\"$INPUT\"
}")

  echo $RESPONSE | jq

  INDEX=$((INDEX+1))
done

echo
echo "5) FINAL STOCK IN LOCATION"
echo "----------------------------------------"

curl -s \
-H "Authorization: Bearer $TOKEN" \
"$API/inventory/location/$LOCATION_ID" | jq

echo
echo "6) LAST 20 LOGS"
echo "----------------------------------------"

curl -s \
-H "Authorization: Bearer $TOKEN" \
"$API/inventory/logs?limit=20" | jq

echo
echo "========================================"
echo "TEST COMPLETE"
echo "========================================"
