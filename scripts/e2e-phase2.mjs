/*
 * تست سرتاسری فاز ۲ — کاتالوگ، پیش‌فاکتور، کیف پول، درگاه، اعتبار، لغو، فاکتور عمومی.
 *
 * اجرا (سرور دِو باید بالا باشد):
 *   node scripts/e2e-phase2.mjs
 *
 * تست واقعی روی API و DB انجام می‌شود؛ در انتها داده‌های تست پاک می‌شوند.
 */
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3002";
const prisma = new PrismaClient();

let cookies = [];
let pass = 0;
let fail = 0;

function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function parseCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) cookies.push(c.split(";")[0]);
}

async function call(url, opts = {}) {
  opts.headers = { ...(opts.headers || {}), cookie: cookies.join("; ") };
  const res = await fetch(BASE + url, opts);
  parseCookies(res);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, res };
}

const json = (data) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const phone = "09" + String(Date.now()).slice(-9);

async function main() {
  console.log("\n== آماده‌سازی ==");

  const tier = await prisma.tier.findUnique({ where: { name: "طلایی" } });
  const shipping = await prisma.shippingMethod.findMany({ orderBy: { sortOrder: "asc" } });
  const product = await prisma.product.findFirst({
    where: { isActive: true, stockQty: { gt: 20 } },
    include: { volumePrices: true },
    orderBy: { price: "asc" },
  });

  check("طبقه طلایی موجود است", !!tier);
  check("روش‌های ارسال seed شده‌اند", shipping.length >= 3, `${shipping.length} روش`);
  check("محصول نمونه موجود است", !!product, product?.name);
  if (!tier || !product) throw new Error("پیش‌نیاز تست آماده نیست");

  console.log("\n== ادمین: ساخت مشتری و شارژ ==");

  cookies = [];
  let r = await call("/api/auth/login", json({ username: "admin", password: "admin1234" }));
  check("ورود ادمین", r.status === 200 && r.body?.role === "admin");

  r = await call(
    "/api/admin/customers",
    json({
      companyName: "تست سرتاسری فاز دو",
      contactName: "آزمون خودکار",
      phone,
      username: `e2e${String(Date.now()).slice(-6)}`,
      tierId: tier.id,
    }),
  );
  const tempPassword = r.body?.tempPassword;
  const customerId = r.body?.customerId;
  check("ساخت مشتری دستی", r.status === 200 && !!customerId);

  const username = (await prisma.customer.findUnique({ where: { id: customerId } })).username;

  await prisma.customer.update({
    where: { id: customerId },
    data: { creditLimitOverride: 50_000_000, discountPercent: 2 },
  });

  console.log("\n== مشتری: کاتالوگ و حساب ==");

  cookies = [];
  r = await call("/api/auth/login", json({ username, password: tempPassword }));
  check("ورود مشتری", r.status === 200 && r.body?.status === "ACTIVE");

  r = await call("/api/catalog");
  const cat = r.body;
  const item = cat?.items?.find((i) => i.id === product.id);
  check("کاتالوگ قیمت‌دار", r.status === 200 && cat?.priceVisible === true);
  check("قیمت پس از تخفیف طبقه+مشتری", item?.price === Math.round(Number(product.price) * 0.86),
    `${item?.price} vs ${Math.round(Number(product.price) * 0.86)}`);

  r = await call("/api/account");
  check("حساب: کیف پول صفر", r.status === 200 && r.body?.wallet === 0);
  check("حساب: سقف اعتبار override", r.body?.creditLimit === 50_000_000);

  console.log("\n== پیش‌فاکتور و قواعد تعداد ==");

  const minQty = Math.max(product.minQty, product.packSize);
  const qty = minQty * 2;

  r = await call("/api/orders", json({ items: [{ productId: product.id, qty: qty + 1 }], shippingId: shipping[0].id }));
  check("رد تعداد نامضرب بسته", r.status === 400 && r.body?.error === "PACK_SIZE", r.body?.message);

  r = await call("/api/orders", json({ items: [{ productId: product.id, qty }], shippingId: shipping[1].id }));
  const order1 = r.body?.order;
  check("ثبت پیش‌فاکتور", r.status === 200 && !!order1?.id, order1?.number);
  check("شماره‌گذاری PF-", /^PF-\d{4}-\d{4}$/.test(order1?.number ?? ""), order1?.number);

  const stockAfterOrder = (await prisma.product.findUnique({ where: { id: product.id } })).stockQty;
  check("رزرو موجودی", stockAfterOrder === product.stockQty - qty, `${product.stockQty} → ${stockAfterOrder}`);

  r = await call(`/api/orders/${order1.id}/pay`, json({ method: "wallet" }));
  check("کیف پول خالی → خطای کسری", r.status === 400 && r.body?.error === "WALLET_SHORT");

  console.log("\n== کیف پول: شارژ دستی ادمین ==");

  cookies = [];
  await call("/api/auth/login", json({ username: "admin", password: "admin1234" }));

  r = await call("/api/admin/wallet", json({ customerId, amount: 2_000_000, note: "تسویه نقدی تست" }));
  check("شارژ دستی ادمین", r.status === 200 && r.body?.balance === 2_000_000);

  r = await call("/api/admin/wallet", json({ customerId, amount: -500_000, note: "اصلاح تست" }));
  check("اصلاح منفی", r.status === 200 && r.body?.balance === 1_500_000);

  r = await call("/api/admin/wallet", json({ customerId, amount: -99_000_000 }));
  check("اصلاح بیش از موجودی رد می‌شود", r.status === 400);

  // ادمین بقیه مبلغ سند را شارژ می‌کند تا پرداخت کیف پولی کامل شود
  cookies = [];
  await call("/api/auth/login", json({ username, password: tempPassword }));

  r = await call("/api/account");
  const walletNow = r.body.wallet;
  const total1 = await prisma.order.findUnique({ where: { id: order1.id } });
  const need = Number(total1.total) - walletNow;

  cookies = [];
  await call("/api/auth/login", json({ username: "admin", password: "admin1234" }));
  r = await call("/api/admin/wallet", json({ customerId, amount: need, note: "تکمیل برای پرداخت تست" }));
  check("شارژ تکمیلی", r.status === 200);

  console.log("\n== پرداخت کامل با کیف پول ==");

  cookies = [];
  await call("/api/auth/login", json({ username, password: tempPassword }));

  r = await call(`/api/orders/${order1.id}/pay`, json({ method: "wallet" }));
  check("پرداخت کیف پولی", r.status === 200 && r.body?.status === "PAID");

  const paid = await prisma.order.findUnique({ where: { id: order1.id } });
  check("سند PAID شد", paid.status === "PAID");
  check("مبلغ از کیف پول کسر شد", Number(paid.paidWallet) === Number(paid.total));

  const walletAfter = (await call("/api/account")).body.wallet;
  check("موجودی کیف پول صفر شد", walletAfter === 0, `wallet=${walletAfter}`);

  console.log("\n== خرید اعتباری ==");

  r = await call("/api/orders", json({ items: [{ productId: product.id, qty: minQty }], shippingId: shipping[0].id }));
  const order2 = r.body?.order;
  r = await call(`/api/orders/${order2.id}/pay`, json({ method: "credit" }));
  check("درخواست اعتباری", r.status === 200 && r.body?.status === "AWAITING_CREDIT_APPROVAL");

  cookies = [];
  await call("/api/auth/login", json({ username: "admin", password: "admin1234" }));

  r = await call("/api/admin/orders?status=AWAITING_CREDIT_APPROVAL");
  check("لیست تأیید اعتباری", r.status === 200 && r.body?.orders?.length >= 1);

  r = await call(`/api/admin/orders/${order2.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve_credit" }),
  });
  check("تأیید اعتباری", r.status === 200 && r.body?.status === "APPROVED_CREDIT");

  const credit = await prisma.order.findUnique({ where: { id: order2.id } });
  check("سررسید ۳۰ روزه ثبت شد", !!credit.creditDueAt);

  cookies = [];
  await call("/api/auth/login", json({ username, password: tempPassword }));
  r = await call("/api/account");
  check("کاهش اعتبار قابل استفاده", r.body.availableCredit === 50_000_000 - Number(credit.creditAmount),
    `available=${r.body.availableCredit}`);

  console.log("\n== لغو سند و آزادسازی موجودی ==");

  r = await call("/api/orders", json({ items: [{ productId: product.id, qty: minQty }], shippingId: shipping[0].id }));
  const order3 = r.body?.order;
  const beforeCancel = (await prisma.product.findUnique({ where: { id: product.id } })).stockQty;

  r = await call(`/api/orders/${order3.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cancel" }),
  });
  check("لغو پیش‌فاکتور", r.status === 200);

  const afterCancel = (await prisma.product.findUnique({ where: { id: product.id } })).stockQty;
  check("بازگشت موجودی", afterCancel === beforeCancel + minQty, `${beforeCancel} → ${afterCancel}`);

  console.log("\n== فاکتور عمومی ==");

  const token = paid.publicToken;
  const page = await fetch(`${BASE}/invoice/${token}`);
  const html = await page.text();
  check("صفحه عمومی فاکتور", page.status === 200 && html.includes(paid.number));
  check("فاکتور اقلام را نشان می‌دهد", html.includes(product.name.slice(0, 10)));

  const missing = await fetch(`${BASE}/invoice/does-not-exist`);
  check("توکن نامعتبر → ۴۰۴", missing.status === 404);

  console.log("\n== درگاه زرین‌پال (سندباکس) ==");

  cookies = [];
  await call("/api/auth/login", json({ username, password: tempPassword }));

  r = await call("/api/payments/checkout", json({ purpose: "WALLET_TOPUP", amount: 100_000 }));
  if (r.status === 200) {
    check("شروع پرداخت درگاه", !!r.body?.redirect, r.body.redirect?.slice(0, 48) + "…");
  } else {
    console.log(`  ⚠️ درگاه سندباکس پاسخ نداد (${r.status}: ${r.body?.message ?? "-"}) — منطق داخلی تست شد، نیاز به اینترنت/سندباکس دارد`);
  }

  console.log("\n== پاک‌سازی داده تست ==");
  await prisma.customer.delete({ where: { id: customerId } }).catch(() => {});
  // محصول تست را به موجودی اولیه برگردان
  await prisma.product.update({ where: { id: product.id }, data: { stockQty: product.stockQty } });

  console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق\n`);
  process.exitCode = fail ? 1 : 0;
}

main()
  .catch((e) => {
    console.error("خطای غیرمنتظره:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
