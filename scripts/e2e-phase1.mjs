/* تست سرتاسری فاز ۱ — بدون مرورگر، شبیه‌سازی کل جریان */
const BASE = "http://localhost:3002";
let cookies = [];

function parseCookies(res) {
  const sc = res.headers.getSetCookie?.() ?? [];
  for (const c of sc) cookies.push(c.split(";")[0]);
}

async function call(url, opts = {}) {
  opts.headers = { ...(opts.headers || {}), cookie: cookies.join("; ") };
  const res = await fetch(BASE + url, opts);
  parseCookies(res);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

(async () => {
  // 1) ثبت‌نام شرکت
  let r = await call("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "پخش تاق کرمان", contactName: "علی فعال", phone: "09123456789" }),
  });
  console.log("1) register:", r.status, r.body?.message ?? r.body?.error);

  // 2) OTP request
  r = await call("/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "09123456789" }),
  });
  const code = r.body?.devCode;
  console.log("2) otp request:", r.status, "code =", code);

  // 3) کد اشتباه
  r = await call("/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "09123456789", code: "000000" }),
  });
  console.log("3) wrong code:", r.status, r.body?.error);

  // 4) کد درست
  r = await call("/api/auth/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "09123456789", code }),
  });
  console.log("4) otp verify:", r.status, "status =", r.body?.status);

  // 5) me — باید PENDING باشد
  r = await call("/api/me");
  console.log("5) me:", r.status, "status =", r.body?.status, "| company =", r.body?.companyName);

  // 6) ادمین بدون لاگین → 403
  r = await call("/api/admin/customers");
  console.log("6) admin w/o login:", r.status, r.body?.error);

  // 7) لاگین ادمین
  cookies = [];
  r = await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" }),
  });
  console.log("7) admin login:", r.status, r.body?.role);

  // 8) لیست در انتظار
  r = await call("/api/admin/customers?status=PENDING");
  const pend = r.body?.customers ?? [];
  console.log("8) pending list:", r.status, "count =", pend.length);

  // 9) تأیید
  const id = pend[0]?.id;
  r = await call(`/api/admin/customers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "activate" }),
  });
  console.log("9) activate:", r.status, r.body?.status);

  // 10) ساخت مشتری دستی
  r = await call("/api/admin/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "تعمیرگاه مرکزی", contactName: "محمد کرمانی", phone: "09351112233", username: "shop1" }),
  });
  const temp = r.body?.tempPassword;
  console.log("10) manual create:", r.status, "tempPassword =", temp);

  // 11) ورود مشتری دستی با یوزرنیم
  cookies = [];
  r = await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "shop1", password: temp }),
  });
  console.log("11) manual customer login:", r.status, "status =", r.body?.status);

  // 12) me مشتری دستی
  r = await call("/api/me");
  console.log("12) me (manual):", r.status, "tier =", r.body?.tier?.name ?? "-", "status =", r.body?.status);

  // 13) خروج
  r = await call("/api/auth/logout", { method: "POST" });
  console.log("13) logout:", r.status, r.body?.message ?? "(کوکی پاک شد)");
})();
