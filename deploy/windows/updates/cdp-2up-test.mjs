// تست چاپ ۲-ستونه: ورود → کالا → دیالوگ لیبل → ۲ کپی → چاپ مستقیم،
// و رهگیری بایت‌های TSPL که واقعاً فرستاده شدند.
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

// ۱) ورود (اگر لاگین است رد شو)
console.log("LOGIN:", await evalv(`(async () => {
  if (!location.href.includes('/login')) return 'ALREADY_IN';
  const inputs = document.querySelectorAll('input');
  const set = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set(inputs[0], 'admin');
  set(inputs[1], '123456');
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'ورود').click();
  return 'CLICKED';
})()`));
await sleep(3500);

// ۲) صفحهٔ کالا
await evalv(`location.href = 'http://localhost:3001/admin/products/c9f3cc28-a713-4346-adbb-f64a36989e28'`);
await sleep(4000);

// ۳) باز کردن دیالوگ لیبل
await evalv(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('چاپ لیبل')).click()`);
await sleep(1500);

// ۴) صبر کن دکمهٔ چاپ مستقیم فعال شود (لیبل‌ها + تنظیمات لود شوند)
let enabled = "NO_BTN";
for (let i = 0; i < 15; i++) {
  enabled = await evalv(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('چاپ مستقیم'));
    if (!btn) return 'NO_BTN';
    return btn.disabled ? 'DISABLED' : 'ENABLED';
  })()`);
  if (enabled === "ENABLED") break;
  await sleep(1000);
}
console.log("DIRECT_BTN_STATE:", enabled);

// ۵) تعداد کپی = ۲ (پر شدن هر دو نیمهٔ رول ۱۰۰)
console.log("SET_COPIES:", await evalv(`(() => {
  const input = [...document.querySelectorAll('input')].find((i) => i.type === 'number');
  if (!input) return 'NO_COPIES_INPUT';
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'SET:' + input.value;
})()`));
await sleep(800);

// ۶) رهگیری invoke و کلیک
console.log("PRINT:", await evalv(`(async () => {
  window.__cdpLog = [];
  const orig = window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
  window.__TAURI__.core.invoke = async function (cmd, args) {
    if (cmd === 'print_tsp_label' && args && args.bytes) {
      window.__cdpLog.push({ cmd, bytes: args.bytes });
    }
    return orig(cmd, args);
  };
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('چاپ مستقیم'));
  if (!btn) return 'NO_DIRECT_BTN';
  btn.click();
  return 'CLICKED';
})()`));
await sleep(3500);

// ۷) خواندن بایت‌ها
console.log("VERIFY:", await evalv(`(() => {
  if (!window.__cdpLog || !window.__cdpLog.length) return 'NO_CAPTURE';
  const bytes = window.__cdpLog[0].bytes;
  const text = String.fromCharCode.apply(null, bytes);
  return JSON.stringify({
    byteLen: bytes.length,
    hasSize100: /SIZE 100 mm,30 mm/.test(text),
    barcodes: (text.match(/BARCODE/g) || []).length,
    hasTwoX: /BARCODE 16,/.test(text) && /BARCODE 416,/.test(text),
    sample: text.replace(/\\r\\n/g, ' | ').slice(0, 200)
  });
})()`));
ws.close();
process.exit(0);