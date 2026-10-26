// ابزار ساخت PDF: قالب، CSS و کمکی‌های عددی/جدول
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = join(HERE, 'out');

/* ------------------------------ کمکی‌های عدد ------------------------------ */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function faDigits(input) {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** عدد صحیح با جداکنندهٔ هزارگان فارسی */
export function fa(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const r = Math.round(n);
  const sign = r < 0 ? '−' : '';
  return sign + faDigits(Math.abs(r).toLocaleString('en-US').replace(/,/g, '٬'));
}

/** یک رقم اعشار */
export function fa1(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n < 0 ? '−' : '';
  const [int, dec] = Math.abs(n).toFixed(1).split('.');
  return sign + faDigits(Number(int).toLocaleString('en-US').replace(/,/g, '٬')) + '٫' + faDigits(dec);
}

export function pct(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  const sign = x < 0 ? '−' : '';
  const body = Math.abs(x * 100).toFixed(digits).replace('.', '٫');
  return sign + faDigits(body) + '٪';
}

/**
 * عددِ منفی در جدول‌های مالی با پرانتز نمایش داده می‌شود.
 * علامت منفیِ پیش از عدد در متن راست‌به‌چپ، به انتهای عدد می‌پرد و خواننده را
 * گمراه می‌کند؛ پرانتز، قراردادِ استاندارد صورت‌های مالی و بی‌ابهام است.
 */
const paren = (n, inner) =>
  n < 0 ? `<span class="neg">(${inner})</span>` : inner;

export function faP(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const r = Math.round(n);
  return paren(r, fa(Math.abs(r)));
}

export function fa1P(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const r = Number(Math.abs(n).toFixed(1)) * (n < 0 ? -1 : 1);
  return paren(r, fa1(Math.abs(r)));
}

export function pctP(x, digits = 0) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  const r = Number(Math.abs(x * 100).toFixed(digits)) * (x < 0 ? -1 : 1);
  return paren(r, pct(Math.abs(r) / 100, digits));
}

/* ------------------------------ اجزای سند ------------------------------ */

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * جدول. rows: آرایه‌ای از آرایه‌ها. اولین ستون راست‌چین، بقیه وسط‌چین.
 * kind: 'total' | 'sub' | 'plain' برای هر سطر از طریق rowKinds.
 * align: 'center' (پیش‌فرض) یا 'right' برای جدول‌های کلید/مقدار و متن‌های بلند.
 */
export function table({ head, rows, note, cls = '', colWidths, rowKinds = [], align = 'right' }) {
  const cols = colWidths ? `<colgroup>${colWidths.map((w) => `<col style="width:${w}">`).join('')}</colgroup>` : '';
  const other = align === 'right' ? 'ta-r' : 'ta-c';
  const thead = head
    ? `<thead><tr>${head.map((h, i) => `<th class="${i === 0 ? 'ta-r' : other}">${h}</th>`).join('')}</tr></thead>`
    : '';
  const body = rows
    .map((r, ri) => {
      const kind = rowKinds[ri] || '';
      return `<tr class="${kind}">${r
        .map((c, ci) => `<td class="${ci === 0 ? 'ta-r' : other}">${c}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  return `<table class="dt ${cls}">${cols}${thead}<tbody>${body}</tbody></table>${
    note ? `<p class="tnote">${note}</p>` : ''
  }`;
}

export function kpi(items) {
  return `<div class="kpis">${items
    .map(
      (k) =>
        `<div class="kpi"><span class="kpi-v">${k.value}</span><span class="kpi-l">${k.label}</span></div>`,
    )
    .join('')}</div>`;
}

export function callout(title, body, kind = 'info') {
  return `<div class="callout ${kind}"><span class="callout-t">${title}</span><div>${body}</div></div>`;
}

/* ------------------------------ CSS ------------------------------ */

export const CSS = `
@font-face { font-family: VazirK; src: url('fonts/vazir-regular.ttf') format('truetype'); font-weight: 400; }
@font-face { font-family: VazirK; src: url('fonts/vazir-bold.ttf') format('truetype'); font-weight: 700; }

@page {
  size: A4;
  margin: 17mm 15mm 16mm 15mm;
}

* { box-sizing: border-box; }

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

body {
  font-family: VazirK, Vazir, Tahoma, sans-serif;
  direction: rtl;
  text-align: right;
  font-size: 10.2pt;
  line-height: 1.95;
  color: #1f2937;
  margin: 0;
  font-variant-numeric: normal;
}

p { margin: 0 0 5pt; text-align: justify; }

h1, h2, h3, h4 { font-weight: 700; color: #14213d; margin: 0; page-break-after: avoid; }

h2 {
  font-size: 15pt;
  margin: 0 0 10pt;
  padding-bottom: 6pt;
  border-bottom: 1.6pt solid #14213d;
  display: flex;
  align-items: baseline;
  gap: 8pt;
}
h2 .num {
  display: inline-block;
  background: #0f766e;
  color: #fff;
  font-size: 10pt;
  padding: 1pt 7pt;
  border-radius: 3pt;
}
h3 { font-size: 11.6pt; margin: 12pt 0 5pt; color: #0f3d3a; }
h4 { font-size: 10.6pt; margin: 9pt 0 3pt; color: #374151; }

ul, ol { margin: 3pt 0 6pt; padding-right: 16pt; }
li { margin-bottom: 2.5pt; text-align: justify; }

.chapter { page-break-before: always; }
.nobreak { page-break-inside: avoid; }

/* --- جدول --- */
.dt { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 6pt 0 3pt; page-break-inside: avoid; }
.dt th {
  background: #14213d; color: #fff; font-weight: 700; padding: 4pt 5pt;
  border: 0.5pt solid #14213d; font-size: 8.8pt;
}
.dt td { padding: 3.2pt 5pt; border: 0.5pt solid #d5dbe3; }
.dt tbody tr:nth-child(even) td { background: #f7f9fb; }
.dt tr.total td { background: #e8f1ef !important; font-weight: 700; border-top: 1pt solid #0f766e; }
.dt tr.sub td { background: #f1f4f8 !important; font-weight: 700; }
.dt tr.section td { background: #eef2f7 !important; font-weight: 700; color: #14213d; }
.ta-r { text-align: right; }
.ta-c { text-align: center; }
.neg { color: #9a3412; }
.tnote { font-size: 8.2pt; color: #6b7280; margin: 2pt 0 8pt; text-align: right; }

/* --- نمودار --- */
svg.chart { direction: ltr; display: block; margin: 6pt 0 2pt; }
.figcap { font-size: 8.2pt; color: #6b7280; text-align: center; margin: 0 0 9pt; }

/* --- KPI --- */.kpis { display: flex; gap: 6pt; margin: 8pt 0 10pt; }
.kpi {
  flex: 1; border: 0.8pt solid #cfd8e3; border-top: 2.6pt solid #0f766e;
  border-radius: 3pt; padding: 6pt 6pt 5pt; text-align: center; background: #fbfcfd;
}
.kpi-v { display: block; font-size: 13pt; font-weight: 700; color: #14213d; line-height: 1.4; }
.kpi-l { display: block; font-size: 8.2pt; color: #55627a; margin-top: 1pt; }

/* --- callout --- */
.callout {
  border: 0.6pt solid #d7dee8; border-right: 3pt solid #0f766e;
  background: #f8fafb; padding: 6pt 8pt; margin: 7pt 0; font-size: 9.6pt;
  page-break-inside: avoid;
}
.callout.warn { border-right-color: #b45309; background: #fdf9f3; }
.callout-t { display: block; font-weight: 700; color: #0b4f4a; margin-bottom: 2pt; font-size: 9.8pt; }
.callout.warn .callout-t { color: #92400e; }

/* --- cover --- */
.cover { height: 262mm; display: flex; flex-direction: column; justify-content: space-between; }
.cover-top { border-bottom: 3pt solid #0f766e; padding-bottom: 8pt; display: flex; justify-content: space-between; align-items: flex-end; }
.brand { font-size: 12pt; font-weight: 700; color: #14213d; letter-spacing: 0.2pt; }
.brand small { display: block; font-weight: 400; font-size: 8.4pt; color: #55627a; letter-spacing: 0; }
.cover-mid { margin-top: 40mm; }
.cover-kicker { font-size: 10.5pt; color: #0f766e; font-weight: 700; margin-bottom: 6pt; }
.cover h1 { font-size: 27pt; line-height: 1.5; color: #14213d; margin: 0 0 8pt; }
.cover .sub { font-size: 13pt; color: #374151; line-height: 1.7; margin-bottom: 14pt; }
.cover .rule { width: 60mm; height: 2pt; background: #b45309; margin: 10pt 0 14pt; }
.cover-meta { display: flex; gap: 0; border: 0.8pt solid #d5dbe3; margin-top: 24mm; }
.cover-meta div { flex: 1; padding: 7pt 9pt; border-left: 0.6pt solid #e2e8f0; }
.cover-meta div:last-child { border-left: 0; }
.cover-meta span { display: block; font-size: 8pt; color: #6b7280; }
.cover-meta b { font-size: 9.6pt; color: #14213d; font-weight: 700; }
.cover-foot { font-size: 8.4pt; color: #6b7280; border-top: 0.6pt solid #d5dbe3; padding-top: 6pt; }

/* --- toc --- */
.toc { margin-top: 6pt; }
.toc a { display: flex; align-items: baseline; text-decoration: none; color: #1f2937; padding: 2.6pt 0; border-bottom: 0.4pt dotted #c7cfdb; }
.toc a:last-child { border-bottom: 0; }
.toc .t { font-weight: 700; }
.toc .t.sub { font-weight: 400; padding-right: 14pt; font-size: 9.6pt; color: #374151; }
.toc .pg { margin-right: auto; color: #0f766e; font-weight: 700; font-size: 9.4pt; }

/* --- misc --- */
.lead { font-size: 10.8pt; color: #374151; }
.small { font-size: 8.8pt; color: #55627a; }
.hr { height: 0.6pt; background: #d5dbe3; margin: 10pt 0; }
.two-col { display: flex; gap: 10pt; }
.two-col > div { flex: 1; }
.checklist { list-style: none; padding-right: 0; }
.checklist li { padding-right: 14pt; position: relative; }
.checklist li::before { content: '✓'; position: absolute; right: 0; color: #0f766e; font-weight: 700; }
.tag { display: inline-block; background: #e8f1ef; color: #0b4f4a; font-size: 8.2pt; padding: 0.5pt 5pt; border-radius: 2pt; margin-left: 3pt; }
.footnote { font-size: 8.2pt; color: #6b7280; }
`;

/* ------------------------------ قالب سند ------------------------------ */

export function renderDocument({ title, body, tocHtml = '' }) {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/* ------------------------------ آماده‌سازی پوشه ------------------------------ */

const FONT_CANDIDATES = [
  ['C:/Windows/Fonts/Vazir Regular.ttf', 'vazir-regular.ttf'],
  ['C:/Windows/Fonts/Vazir Bold.ttf', 'vazir-bold.ttf'],
];

export function prepareOutDir() {
  mkdirSync(join(OUT, 'fonts'), { recursive: true });
  for (const [src, dst] of FONT_CANDIDATES) {
    const target = join(OUT, 'fonts', dst);
    if (!existsSync(target)) {
      if (!existsSync(src)) throw new Error(`فونت پیدا نشد: ${src}`);
      copyFileSync(src, target);
    }
  }
}

export function writeHtml(name, html) {
  const p = join(OUT, name);
  writeFileSync(p, html, 'utf8');
  return p;
}

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* ------------------------------ چاپ با شمارهٔ صفحه (CDP) ------------------------------ */

const FOOTER = (label) => `
<div style="width:100%; padding:0 14mm; font-family:Vazir, Tahoma, sans-serif; font-size:8pt; color:#6b7280; direction:rtl; display:flex; justify-content:space-between; align-items:center; border-top:0.4pt solid #d5dbe3; padding-top:2mm;">
  <span style="font-family:Vazir, Tahoma, sans-serif;">${label}</span>
  <span style="font-family:Vazir, Tahoma, sans-serif;">صفحهٔ <span class="pageNumber"></span> از <span class="totalPages"></span></span>
</div>`;

async function cdpJson(port, path, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
  return res.json();
}

/**
 * چاپ HTML به PDF با فوتر فارسی و شمارهٔ صفحه.
 * از DevTools Protocol استفاده می‌کند چون CLI کروم امکان فوتر سفارشی ندارد.
 */
export async function printPdfNumbered(htmlPath, pdfPath, { footerLabel = 'طرح توجیهی کاردو' } = {}) {
  const { spawn } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const port = 9333 + Math.floor(Math.random() * 200);
  const profile = join(tmpdir(), `kardo-pdf-${Date.now()}`);
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-sandbox',
      '--allow-file-access-from-files',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const v = await cdpJson(port, '/json/version');
        ready = Boolean(v.webSocketDebuggerUrl);
      } catch {
        /* هنوز بالا نیامده */
      }
    }
    if (!ready) throw new Error('کروم برای چاپ بالا نیامد');

    const url = 'file:///' + htmlPath.replace(/\\/g, '/');
    const target = await cdpJson(port, `/json/new?${encodeURIComponent(url)}`, 'PUT');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    let idSeq = 0;
    const pending = new Map();
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++idSeq;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const loaded = new Promise((resolve) => {
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.method === 'Page.loadEventFired') {
          ws.removeEventListener('message', onMsg);
          resolve();
        }
      };
      ws.addEventListener('message', onMsg);
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });

    await send('Page.enable');
    await send('Page.navigate', { url });
    await loaded;
    // مهلت کوتاه برای بارگذاری فونت‌ها
    await send('Runtime.evaluate', { expression: 'document.fonts.ready' });
    await new Promise((r) => setTimeout(r, 400));

    const result = await send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: FOOTER(footerLabel),
      marginTop: 0.63, // اینچ — با @page هم‌تراز است؛ preferCSSPageSize اولویت دارد
      marginBottom: 0.63,
      marginLeft: 0,
      marginRight: 0,
    });
    writeFileSync(pdfPath, Buffer.from(result.data, 'base64'));
    ws.close();
    return pdfPath;
  } finally {
    chrome.kill();
  }
}

/** چاپ یک فایل HTML به PDF با Chrome (بدون هدر/فوتر) */
export function printPdf(htmlPath, pdfPath) {
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--allow-file-access-from-files',
      '--no-pdf-header-footer',
      '--no-sandbox',
      `--print-to-pdf=${pdfPath}`,
      '--virtual-time-budget=8000',
      'file:///' + htmlPath.replace(/\\/g, '/'),
    ],
    { stdio: 'ignore' },
  );
  return pdfPath;
}

export function countPages(pdfPath) {
  const buf = readFileSyncSafe(pdfPath);
  const matches = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

import { readFileSync } from 'node:fs';
function readFileSyncSafe(p) {
  return readFileSync(p);
}
