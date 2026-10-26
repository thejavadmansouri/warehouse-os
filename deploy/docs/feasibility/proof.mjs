/**
 * بازبینی بصری سند: صفحه‌های HTML را با عرض دقیقِ ناحیهٔ چاپ (۱۸۰ میلی‌متر)
 * رندر می‌کند و به‌صورت نوارهای هم‌ارتفاعِ صفحهٔ A4 ذخیره می‌کند.
 * برای بررسی چیدمان جدول‌ها و خوانایی؛ صفحه‌بندیِ واقعی را خودِ PDF دارد.
 *
 *   node proof.mjs [نام-فایل.html] [تعداد نوار]
 */
import { join } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { CHROME, OUT } from './template.mjs';

const htmlName = process.argv[2] ?? 'kardo-feasibility.html';
const want = Number(process.argv[3] ?? 6);

const PORT = 9700 + Math.floor(Math.random() * 100);
const profile = mkdtempSync(join(tmpdir(), 'kardo-proof-'));
const { spawn } = await import('node:child_process');
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-sandbox',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const json = async (path, method = 'GET') =>
  (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json();

try {
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const v = await json('/json/version');
      ready = Boolean(v.webSocketDebuggerUrl);
    } catch {
      /* در انتظار */
    }
  }
  if (!ready) throw new Error('کروم بالا نیامد');

  const url = 'file:///' + join(OUT, htmlName).replace(/\\/g, '/');
  const target = await json(`/json/new?${encodeURIComponent(url)}`, 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message));
      else resolve(m.result);
    }
  });

  const loaded = new Promise((resolve) => {
    const onMsg = (ev) => {
      if (JSON.parse(ev.data).method === 'Page.loadEventFired') {
        ws.removeEventListener('message', onMsg);
        resolve();
      }
    };
    ws.addEventListener('message', onMsg);
  });

  await send('Page.enable');
  // عرض ۲۱۰mm = ۷۹۴px با حاشیهٔ چاپ، تا تصویر شبیه صفحهٔ واقعی شود.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 794,
    height: 1123,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await send('Page.navigate', { url });
  await loaded;
  await send('Runtime.evaluate', { expression: 'document.fonts.ready' });
  await send('Runtime.evaluate', {
    expression: `(() => {
      const s = document.createElement('style');
      s.textContent = 'body { padding: 17mm 15mm 16mm 15mm; }';
      document.head.appendChild(s);
    })()`,
  });
  await new Promise((r) => setTimeout(r, 500));

  const { result } = await send('Runtime.evaluate', {
    expression: 'document.body.scrollHeight',
  });
  const height = Number(result.value);
  const pages = Math.ceil(height / 1123);
  const shots = Math.min(want, pages);

  for (let i = 0; i < shots; i++) {
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: i * 1123, width: 794, height: 1123, scale: 1.4 },
    });
    const file = join(OUT, `proof-${String(i + 1).padStart(2, '0')}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('نوشته شد:', file);
  }
  console.log(`ارتفاع سند: ${height}px ≈ ${pages} نوار`);
  ws.close();
} finally {
  chrome.kill();
}
