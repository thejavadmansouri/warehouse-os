// تولید UUID v4 که روی HTTP ساده (باز کردن پنل با IP داخلی) هم کار می‌کند.
//
// crypto.randomUUID فقط در «secure context» (HTTPS یا localhost) وجود دارد،
// پس وقتی پنل با http://<ip>:3001 باز می‌شود undefined است و ساخت فاکتور
// و رسید با خطا متوقف می‌شد. crypto.getRandomValues در همه‌ی زمینه‌ها هست.
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // نسخه ۴
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, "0"));

  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}
