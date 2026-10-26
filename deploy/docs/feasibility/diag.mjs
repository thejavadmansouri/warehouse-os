/** عیب‌یابی چیدمان: عناصری که از عرض ناحیهٔ چاپ پهن‌ترند. */
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { CHROME, OUT } from './template.mjs';

const htmlName = process.argv[2] ?? 'kardo-feasibility.html';
const PORT = 9800 + Math.floor(Math.random() * 100);
const { spawn } = await import('node:child_process');
const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox',
    '--hide-scrollbars', '--allow-file-access-from-files',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'kardo-diag-'))}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const json = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:${PORT}${p}`, { method: m })).json();

try {
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { ready = Boolean((await json('/json/version')).webSocketDebuggerUrl); } catch { /* wait */ }
  }
  const url = 'file:///' + join(OUT, htmlName).replace(/\\/g, '/');
  const target = await json(`/json/new?${encodeURIComponent(url)}`, 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
    }
  });
  const loaded = new Promise((resolve) => {
    const onMsg = (ev) => { if (JSON.parse(ev.data).method === 'Page.loadEventFired') { ws.removeEventListener('message', onMsg); resolve(); } };
    ws.addEventListener('message', onMsg);
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 680, height: 998, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await loaded;
  await send('Runtime.evaluate', { expression: 'document.fonts.ready' });
  await new Promise((r) => setTimeout(r, 400));

  const expr = `(() => {
    const W = 680;
    const out = [];
    out.push('scrollWidth=' + document.documentElement.scrollWidth + ' clientWidth=' + document.documentElement.clientWidth + ' bodyScroll=' + document.body.scrollWidth);
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > W + 1 || r.left < -1) {
        const t = (el.className && typeof el.className === 'string') ? '.' + el.className.split(' ').join('.') : el.tagName;
        out.push([Math.round(r.left), Math.round(r.width), el.tagName + t.slice(0, 40), (el.textContent||'').trim().slice(0, 30)].join(' | '));
      }
    }
    return out.slice(0, 40).join('\\n');
  })()`;
  const { result } = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(result.value);
  ws.close();
} finally {
  chrome.kill();
}
