// تست پل کامل چاپ لیبل: صفحهٔ وب داخل اپ فروشنده → invoke → Rust → winspool RAW → پرینتر.
// با WOOS_DEVTOOLS_PORT=9222 اجرا کنید و بعد این اسکریپت را با node اجرا کنید.
const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page =
  list.find((t) => t.type === "page" && t.url.includes("localhost:3001")) ||
  list.find((t) => t.type === "page");
if (!page) {
  console.error("NO_PAGE_TARGET");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  }
};
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

// همان payload که دکمهٔ «چاپ مستقیم (حرارتی)» می‌سازد: لیبل ۵۰×۳۰ با بارکد.
const expr = `(async () => {
  const cmd = "SIZE 50 mm,30 mm\\r\\nGAP 2 mm,0 mm\\r\\nDIRECTION 1\\r\\nCLS\\r\\n" +
    'BARCODE 4,6,"128",70,2,0,2,2,2,"900200-CDP-TEST"\\r\\n' +
    "PRINT 1,1\\r\\n";
  const bytes = new TextEncoder().encode(cmd);
  try {
    const r = await window.__TAURI__.core.invoke("print_tsp_label", { bytes: Array.from(bytes) });
    return "OK:" + JSON.stringify(r);
  } catch (e) {
    return "ERR:" + String(e);
  }
})()`;

const res = await send("Runtime.evaluate", {
  expression: expr,
  awaitPromise: true,
  returnByValue: true,
});
const value = res?.result?.value;
console.log("RESULT:", value ?? JSON.stringify(res));
ws.close();
process.exit(value?.startsWith("OK") ? 0 : 1);