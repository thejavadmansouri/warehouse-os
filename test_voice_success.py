import requests
import json

BASE_URL = "http://localhost:3000"

# ۱. دریافت توکن ورود با پسورد جدید
print("--- 🔐 Logging in ---")
login_res = requests.post(f"{BASE_URL}/auth/login", json={
    "username": "admin",
    "password": "123456"
})

if login_res.status_code != 200:
    print("[-] Login failed:", login_res.text)
    exit(1)

token = login_res.json().get("access_token") or login_res.json().get("token")
headers = {"Authorization": f"Bearer {token}"}
print("[+] Login successful!")

# جملات سخت و چالشی برای تست دقت
test_sentences = [
    "سپر جلوی ۴۰۵ SLX برند صرف ۲۰ عدد",
    "چراغ جلوی دنا پلاس توربو اتومات ۵ عدد مدرن",
    "شمع موتور تیوفایو ۳۰ عدد ان جی کا"
]

print("\n--- 🎙️ Running Hard Voice Test Cases ---")
for i, sentence in enumerate(test_sentences, 1):
    print(f"\n[Test {i}] Sending text: '{sentence}'")
    
    payload = {
        "text": sentence,
        "locationCode": "LOC000001"
    }
    
    res = requests.post(f"{BASE_URL}/inventory/voice", json=payload, headers=headers)
    print(f"Status: {res.status_code}")
    try:
        print(json.dumps(res.json(), indent=2, ensure_ascii=False))
    except:
        print(res.text)

print("\n--- ✅ All test cases executed! ---")