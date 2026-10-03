"""
سنجش تطبیق صوتی روی ۱۰۰ محصول واقعی، با ۶ شکل مختلف گفتار.

سه نتیجه‌ی ممکن برای هر جست‌وجو:
  دقیق    → همان محصول دقیق در رتبه‌ی ۱
  هم‌قطعه → قطعه‌ی درست ولی برند دیگر (وقتی برند گفته نشده، این درست است)
  غلط     → قطعه‌ی دیگری
"""
import json, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

API = "http://127.0.0.1:3000"
TOKEN = open("token.txt").read().strip()
LOCB = open("locb.txt").read().strip()
SID = open("sid.txt").read().strip()

FA = "۰۱۲۳۴۵۶۷۸۹"
to_fa = lambda s: "".join(FA[int(c)] if c.isdigit() else c for c in s)

names = [l.strip() for l in open("bench100.txt") if l.strip()]

# «قطعه» = نام بدون کلمه‌ی آخر (که معمولاً برند است)
part_of = lambda n: " ".join(n.split()[:-1])


def variants(n):
    w = n.split()
    base = part_of(n)
    return {
        "کامل": n,
        "با تعداد": "دو تا " + n,
        "بدون برند": base,
        "بدون برند + تعداد": "سه عدد " + base,
        "کوتاه (۳ کلمه)": " ".join(w[:3]),
        "ارقام فارسی": to_fa(base),
    }


def ask(text):
    body = json.dumps(
        {"locationBarcode": LOCB, "text": text, "sessionId": SID}, ensure_ascii=False
    )
    out = subprocess.run(
        ["curl", "-s", "-X", "POST", f"{API}/inventory/voice/preview",
         "-H", f"Authorization: Bearer {TOKEN}",
         "-H", "Content-Type: application/json", "-d", body],
        capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return None
    return d


def classify(target, d):
    if not d:
        return "هیچ", False, 0

    nm = lambda s: (s.get("product") or {}).get("name", "")
    sug = d.get("suggestions") or []

    # مسیر تأیید خودکار محصول را در فیلد product برمی‌گرداند، نه در suggestions.
    # نادیده گرفتنِ آن یعنی موفق‌ترین حالت را «بدون نتیجه» بشماریم.
    auto = bool(d.get("product")) and not d.get("needSelection")

    if auto:
        top = (d["product"] or {}).get("name", "")
        names3 = [top]
    elif sug:
        top = nm(sug[0])
        names3 = [nm(s) for s in sug[:3]]
    else:
        return "هیچ", False, 0
    if top == target:
        return "دقیق", auto, 1 if target in names3 else 1
    if part_of(top) == part_of(target) or part_of(target) in top:
        return "هم‌قطعه", auto, 1 if target in names3 else 0
    return "غلط", auto, 1 if target in names3 else 0


jobs = [(n, label, text) for n in names for label, text in variants(n).items()]
results = []

def work(job):
    n, label, text = job
    d = ask(text)
    verdict, auto, in3 = classify(n, d)
    return (label, verdict, auto, in3)

with ThreadPoolExecutor(max_workers=8) as ex:
    results = list(ex.map(work, jobs))

by_variant = {}
for label, verdict, auto, in3 in results:
    s = by_variant.setdefault(label, {"دقیق": 0, "هم‌قطعه": 0, "غلط": 0, "هیچ": 0,
                                      "auto": 0, "in3": 0, "n": 0})
    s[verdict] += 1
    s["auto"] += auto
    s["in3"] += in3
    s["n"] += 1

order = ["کامل", "با تعداد", "بدون برند", "بدون برند + تعداد", "کوتاه (۳ کلمه)", "ارقام فارسی"]
print(f"{'شکل گفتار':<22}{'دقیق':>7}{'هم‌قطعه':>9}{'قابل‌قبول':>11}{'غلط':>7}{'در ۳ اول':>10}")
print("-" * 68)
tot = {"دقیق": 0, "هم‌قطعه": 0, "غلط": 0, "هیچ": 0, "in3": 0, "n": 0, "auto": 0}
for label in order:
    s = by_variant.get(label)
    if not s:
        continue
    ok = s["دقیق"] + s["هم‌قطعه"]
    print(f"{label:<22}{s['دقیق']:>6}%{s['هم‌قطعه']:>8}%{ok:>10}%{s['غلط']+s['هیچ']:>6}%{s['in3']:>9}%")
    for k in ("دقیق", "هم‌قطعه", "غلط", "هیچ", "in3", "n", "auto"):
        tot[k] += s[k]
print("-" * 68)
n = tot["n"]
ok = tot["دقیق"] + tot["هم‌قطعه"]
print(f"{'مجموع (' + str(n) + ' جست‌وجو)':<22}"
      f"{round(100*tot['دقیق']/n):>6}%{round(100*tot['هم‌قطعه']/n):>8}%"
      f"{round(100*ok/n):>10}%{round(100*(tot['غلط']+tot['هیچ'])/n):>6}%"
      f"{round(100*tot['in3']/n):>9}%")
print()
print(f"تأیید خودکار: {tot['auto']} از {n}")
