#!/bin/bash

API="http://localhost:3000"

echo "=============================="
echo "WORKER INVENTORY FLOW TEST"
echo "=============================="


echo ""
echo "1) LOGIN"
echo "=============================="

TOKEN=$(curl -s -X POST $API/auth/login \
-H "Content-Type: application/json" \
-d '{
"username":"admin",
"password":"123456"
}' | jq -r '.access_token')


if [ "$TOKEN" == "null" ]; then
 echo "LOGIN FAILED"
 exit
fi

echo "LOGIN OK"


echo ""
echo "2) SCAN LOCATION BARCODE"
echo "=============================="

LOCATION=$(curl -s \
-H "Authorization: Bearer $TOKEN" \
"$API/locations/barcode/LOC000002")

echo $LOCATION | jq


LOCATION_ID=$(echo $LOCATION | jq -r '.id')


echo ""
echo "LOCATION:"
echo $LOCATION_ID



echo ""
echo "3) CONTINUOUS VOICE SESSION"
echo "=============================="


echo "VOICE INPUTS:"

voices=(
"سرسیلندر پراید 405 چهل عدد"
"لنت ترمز جلو پراید تکستار بیست جفت"
"فیلتر روغن پژو مان پنجاه عدد"
"تسمه تایم دنا ده عدد"
"شمع موتور NGK سی عدد"
)


for voice in "${voices[@]}"
do

echo ""
echo "INPUT:"
echo $voice


curl -s -X POST $API/inventory/voice \
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json" \
-d "{
 \"locationId\":\"$LOCATION_ID\",
 \"text\":\"$voice\"
}" | jq


sleep 1

done



echo ""
echo "=============================="
echo "CHECK LOCATION STOCK"
echo "=============================="


curl -s \
-H "Authorization: Bearer $TOKEN" \
"$API/inventory/location/$LOCATION_ID" | jq



echo ""
echo "=============================="
echo "CHECK LOGS"
echo "=============================="


curl -s \
-H "Authorization: Bearer $TOKEN" \
"$API/inventory/logs?limit=20" | jq


echo ""
echo "DONE"
