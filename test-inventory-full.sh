#!/bin/bash

BASE=http://127.0.0.1:3000

echo "=============================="
echo "LOGIN"
echo "=============================="

TOKEN=$(curl -s -X POST $BASE/auth/login \
-H "Content-Type: application/json" \
-d '{"username":"admin","password":"123456"}' \
| python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

AUTH="Authorization: Bearer $TOKEN"

echo "LOGIN OK"


echo ""
echo "=============================="
echo "CREATE DATA"
echo "=============================="


LT=$(curl -s -X POST $BASE/location-types \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d '{"name":"TEST","level":"SHELF"}' \
| python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")


LOC1=$(curl -s -X POST $BASE/locations \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d "{\"name\":\"LOC-A\",\"typeId\":\"$LT\"}")

LOC1_ID=$(echo $LOC1 | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

LOC2=$(curl -s -X POST $BASE/locations \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d "{\"name\":\"LOC-B\",\"typeId\":\"$LT\"}")

LOC2_ID=$(echo $LOC2 | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")


PROD=$(curl -s -X POST $BASE/products \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d "{\"name\":\"لنت تست\",\"sku\":\"TEST-$(date +%s)\",\"unit\":\"عدد\"}")

PROD_ID=$(echo $PROD | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")


echo "PRODUCT=$PROD_ID"


echo ""
echo "=============================="
echo "IN +10"
echo "=============================="


curl -s -X POST $BASE/inventory \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$LOC1_ID\",\"quantity\":10}" | python3 -m json.tool


echo ""
echo "=============================="
echo "OUT 3"
echo "=============================="


curl -s -X POST $BASE/inventory/out \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$LOC1_ID\",\"quantity\":3}" | python3 -m json.tool


echo ""
echo "=============================="
echo "TRANSFER 2"
echo "=============================="


curl -s -X POST $BASE/inventory-transfer \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d "{\"productId\":\"$PROD_ID\",\"fromLocationId\":\"$LOC1_ID\",\"toLocationId\":\"$LOC2_ID\",\"quantity\":2}" | python3 -m json.tool


echo ""
echo "=============================="
echo "LOGS"
echo "=============================="


curl -s "$BASE/inventory/logs?page=1&limit=20" \
-H "$AUTH" | python3 -m json.tool


echo ""
echo "DONE"
