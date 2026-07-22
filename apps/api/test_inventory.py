import requests


BASE_URL = "http://localhost:3000"

TOKEN = "توکن_JWT_اینجا_بگذار"


def lookup_barcode(barcode):
    url = f"{BASE_URL}/barcode/lookup/{barcode}"

    r = requests.get(url)

    print("\n=== LOOKUP ===")
    print(r.status_code)
    print(r.json())


def operation():

    url = f"{BASE_URL}/barcode/operation"

    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }

    data = {
        "barcode": "WOS000000001",
        "locationBarcode": "LOC000002",
        "action": "SALE",
        "quantity": 1,
        "note": "تست با پایتون"
    }


    r = requests.post(
        url,
        headers=headers,
        json=data
    )


    print("\n=== OPERATION ===")
    print(r.status_code)
    print(r.json())



def operation_with_image():

    url = f"{BASE_URL}/barcode/operation-with-image"


    data = {
        "barcode": "WOS000000001",
        "locationBarcode": "LOC000002",
        "action": "SALE",
        "quantity": "1",
        "note": "تست عکس با پایتون"
    }


    files = {
        "file": open("test.jpg","rb")
    }


    r = requests.post(
        url,
        data=data,
        files=files
    )


    print("\n=== IMAGE OPERATION ===")
    print(r.status_code)
    print(r.json())



def logs():

    url = f"{BASE_URL}/inventory/logs"

    r = requests.get(url)

    print("\n=== LOGS ===")

    logs = r.json()

    for item in logs[:5]:

        print(
            item["action"],
            item["quantity"],
            item["note"],
            item["image"],
            item.get("user")
        )



if __name__ == "__main__":


    lookup_barcode(
        "WOS000000001"
    )


    operation()


    operation_with_image()


    logs()
