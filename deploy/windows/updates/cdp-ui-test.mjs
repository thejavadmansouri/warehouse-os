// تست کامل UI داخل اپ فروشنده: ورود → صفحهٔ کالا → دیالوگ لیبل → «چاپ مستقیم (حرارتی)».
const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page =
  list.find((t) => t.type === "page" && t.url.includes("localhost:3001")) ||
  list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
};
await new Promise((res) => (ws.onopen = res));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evalv(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return r?.result?.value;
}

// ۱) ورود
console.log("LOGIN:", await evalv(`(async () => {
  const inputs = document.querySelectorAll('input');
  if (inputs.length < 2) return 'NO_INPUTS:' + inputs.length;
  const set = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set(inputs[0], 'admin');
  set(inputs[1], '123456');
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'ورود');
  if (!btn) return 'NO_LOGIN_BTN';
  btn.click();
  return 'CLICKED';
})()`));
await sleep(3500);
console.log("URL_AFTER_LOGIN:", await evalv(`location.href`));

// ۲) رفتن به صفحهٔ کالا (لوله تانکی 405 دیناپارت — SKU 1250203)
await evalv(`location.href = 'http://localhost:3001/admin/products/c9f3cc28-a713-4346-adbb-f64a36989e28'`);
await sleep(4000);

// ۳) باز کردن دیالوگ چاپ لیبل
console.log("OPEN_DIALOG:", await evalv(`(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent.includes('چاپ لیبل'));
  if (!btns.length) return 'NO_LABEL_BTN';
  btns[0].click();
  return 'CLICKED:' + btns.length;
})()`));
await sleep(2500);

// ۴) بررسی وجود دکمهٔ «چاپ مستقیم (حرارتی)» و کلیک
console.log("DIRECT_BTN:", await evalv(`(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('چاپ مستقیم'));
  if (!btn) return 'NOT_FOUND';
  btn.click();
  return 'CLICKED';
})()`));
await sleep(3000);

// ۵) نتیجه — خطا یا موفقیت
console.log("RESULT:", await evalv(`(() => {
  const errs = [...document.querySelectorAll('*')].filter((el) => {
    const t = el.textContent || '';
    return el.children.length === 0 && /چاپ مستقیم ناموفق|تنظیمات چاپ در دسترس نیست|داده.{0,4}چاپ|not allowed|ACL/.test(t);
  }).map((el) => el.textContent.trim());
  const success = [...document.querySelectorAll('*')].filter((el) => {
    const t = el.textContent || '';
    return el.children.length === 0 && /لیبل روی پرینتر حرارتی چاپ شد/.test(t);
  }).map((el) => el.textContent.trim());
  return JSON.stringify({ errors: errs.slice(0,3), success: success.slice(0,3) });
})()`));
ws.close();
process.exit(0);