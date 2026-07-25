#!/bin/bash

BASE="http://127.0.0.1:3000"

echo "=============================="
echo "LOGIN"
echo "=============================="


LOGIN_RESPONSE=$(curl -s -X POST $BASE/auth/login \
-H "Content-Type: application/json" \
-d '{"username":"admin","password":"123456"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "
import json,sys
data=json.load(sys.stdin)
print(data.get('access_token',''))
")

if [ -z "$TOKEN" ]; then
    echo "LOGIN FAILED"
    echo "$LOGIN_RESPONSE"
    exit 1
else
    echo "LOGIN OK"
fi

AUTH="Authorization: Bearer $TOKEN"

if [ -z "$TOKEN" ]; then
 echo "LOGIN FAILED"
 exit 1
fi


AUTH="Authorization: Bearer $TOKEN"


echo "LOGIN OK"


echo ""
echo "=============================="
echo "CREATE LOCATION"
echo "=============================="


LT=$(curl -s -X POST "$BASE/location-types" \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d '{"name":"TEST","level":"SHELF"}' \
| python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")



LOC=$(curl -s -X POST "$BASE/locations" \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d "{\"name\":\"TEST-LOC\",\"typeId\":\"$LT\"}")


echo "$LOC"


LOC_ID=$(echo "$LOC" | python3 -c "import sys,json; 
print(json.load(sys.stdin)['id'])")



echo ""
echo "=============================="
echo "CREATE PRODUCT"
echo "=============================="


SKU="TEST-$(date +%s)"


PROD=$(curl -s -X POST "$BASE/products" \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d "{\"name\":\"TEST PRODUCT\",\"sku\":\"$SKU\",\"unit\":\"عدد\"}")


echo "$PROD"


PROD_ID=$(echo "$PROD" | python3 -c "import sys,json; 
print(json.load(sys.stdin)['id'])")



echo ""
echo "=============================="
echo "INVENTORY IN"
echo "=============================="


JSON=$(python3 - <<EOF
import json
print(json.dumps({
    "productId": "$PROD_ID",
    "locationId": "$LOC_ID",
    "quantity": 10
}))
EOF
)


echo "SEND:"
echo "$JSON"


INV=$(curl -s -X POST "$BASE/inventory" \
-H "$AUTH" \
-H "Content-Type: application/json" \
-d "$JSON")


echo "$INV" | python3 -m json.tool


echo ""
echo "=============================="
echo "CHECK INVENTORY"
echo "=============================="


curl -s "$BASE/inventory/$PROD_ID/$LOC_ID" \
-H "$AUTH" \
| python3 -m json.tool



echo ""
echo "DONE"
