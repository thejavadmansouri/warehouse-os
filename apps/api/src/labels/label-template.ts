import * as fs from 'fs';
import * as path from 'path';

let jsBarcodeSource: string | null = null;

function loadJsBarcodeSource(): string {
  if (jsBarcodeSource) return jsBarcodeSource;

  const candidates = [
    'node_modules/jsbarcode/bin/JsBarcode.all.min.js',
    'node_modules/jsbarcode/dist/JsBarcode.all.min.js',
    '../../node_modules/jsbarcode/dist/JsBarcode.all.min.js',
  ];

  for (const rel of candidates) {
    const full = path.resolve(process.cwd(), rel);

    if (fs.existsSync(full)) {
      jsBarcodeSource = fs.readFileSync(full, 'utf-8');

      return jsBarcodeSource;
    }
  }

  throw new Error('فایل JsBarcode پیدا نشد');
}

export interface LabelData {
  id: string;

  code: string;

  barcode: string;

  name: string;

  pathText: string;

  warehouseName: string | null;

  qrCode: string;
}

export interface ProductLabelData {
  name: string;
  barcode: string;
}

const FONT_STACK = `'Vazirmatn','IRANSans',Tahoma,'Geeza Pro',sans-serif`;

const BARCODE_SCRIPT = `

document.querySelectorAll('svg.barcode')
.forEach(function(el){

 JsBarcode(
   el,
   el.getAttribute('jsbarcode-value'),
   {
     format:'CODE128',
     height:Number(
       el.getAttribute('jsbarcode-height')
     ),
     width:Number(
       el.getAttribute('jsbarcode-width')
     ),
     margin:0,
     displayValue:false
   }
 );

});

`;

function labelBlock(l: LabelData): string {
  return `

<div class="label">


<div class="qr">

<img src="${l.qrCode}" />

</div>



<div class="code">

${l.code}

</div>



<div class="path">

${l.pathText}

</div>



<svg

class="barcode"

jsbarcode-value="${l.barcode}"

jsbarcode-height="35"

jsbarcode-width="1.5">

</svg>



</div>

`;
}

export function buildThermalLabelHtml(l: LabelData, widthPx = 384): string {
  return `

<!DOCTYPE html>

<html dir="rtl" lang="fa">


<head>

<meta charset="utf-8"/>


<style>


*{

box-sizing:border-box;

margin:0;

padding:0;

}



body{

font-family:${FONT_STACK};

background:white;

}



#label-root{

width:${widthPx}px;

padding:8px;

display:flex;

justify-content:center;

}



.label{

width:100%;

display:flex;

flex-direction:column;

align-items:center;

}



.qr img{

width:${Math.round(widthPx * 0.55)}px;

height:${Math.round(widthPx * 0.55)}px;

}



.code{

font-size:20px;

font-weight:bold;

margin-top:4px;

}



.path{

font-size:13px;

margin-top:3px;

text-align:center;

}



.barcode{

width:90%;

height:50px;

margin-top:6px;

}



</style>


</head>



<body>


<div id="label-root">

${labelBlock(l)}

</div>



<script>

${loadJsBarcodeSource()}

</script>


<script>

${BARCODE_SCRIPT}

</script>


</body>


</html>

`;
}

/** کاغذهای پشتیبانی‌شده برای برگه‌ی لیبل. */
export type LabelPaper = 'A4' | 'A5' | 'A6';

const PAPER_WIDTH_MM: Record<LabelPaper, number> = {
  A4: 210,
  A5: 148,
  A6: 105,
};

const SHEET_MARGIN_MM = 8;
const SHEET_LABEL_W_MM = 50;
const SHEET_GAP_MM = 5;

/**
 * بیشترین ستونی که روی این کاغذ جا می‌شود.
 *
 * سه ستونِ ثابت روی A4 درست بود ولی روی A5 و A6 از لبه بیرون می‌زد و مرورگر
 * ستونِ آخر را می‌بُرید — چیزی که فقط بعد از چاپ معلوم می‌شد.
 */
export function sheetColumnsFor(paper: LabelPaper): number {
  const usable = PAPER_WIDTH_MM[paper] - 2 * SHEET_MARGIN_MM;
  return Math.max(
    1,
    Math.floor((usable + SHEET_GAP_MM) / (SHEET_LABEL_W_MM + SHEET_GAP_MM)),
  );
}

export function buildSheetLabelHtml(
  labels: LabelData[],
  columns?: number,
  paper: LabelPaper = 'A4',
): string {
  // ستونِ خواسته‌شده هیچ‌وقت از چیزی که جا می‌شود بیشتر نمی‌شود؛ وگرنه کاربر
  // عددی می‌فرستد و برگه‌ی بریده تحویل می‌گیرد.
  const maxCols = sheetColumnsFor(paper);
  const cols = Math.max(1, Math.min(columns ?? maxCols, maxCols));

  const cards = labels.map(labelBlock).join('\n');

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">

<head>

<meta charset="utf-8"/>

<style>

@page {
  size: ${paper};
  margin: ${SHEET_MARGIN_MM}mm;
}


* {
  box-sizing: border-box;
  margin:0;
  padding:0;
}


body {

  font-family:${FONT_STACK};
  background:white;

}


.grid {

  display:grid;

  grid-template-columns:repeat(${cols}, ${SHEET_LABEL_W_MM}mm);

  gap:${SHEET_GAP_MM}mm;

}


.label {

  width:50mm;
  height:40mm;

  border:1px dashed #999;

  display:flex;

  flex-direction:column;

  align-items:center;

  justify-content:flex-start;

  padding:2mm;

  break-inside:avoid;

}


.qr img {

  width:18mm;
  height:18mm;

}


.text {

  width:100%;

  text-align:center;

  margin-top:1mm;

}


.code {

  font-size:11pt;

  font-weight:bold;

}


.path {

  font-size:7pt;

  margin-top:1mm;

  line-height:1.2;

  max-height:8mm;

  overflow:hidden;

}



.barcode {

  width:90%;

  height:7mm;

  margin-top:1mm;

}


</style>


</head>


<body>


<div class="grid">

${cards}

</div>


<script>

${loadJsBarcodeSource()}

</script>


<script>

${BARCODE_SCRIPT}

</script>


</body>


</html>

`;
}

export interface ProductSheetOptions {
  columns?: number; // تعداد ستون در هر ردیف
  copies?: number; // چند کپی از هر لیبل (پیش‌فرض ۱)
  widthMm?: number; // عرض هر لیبل
  heightMm?: number; // ارتفاع هر لیبل
  gapMm?: number; // فاصله‌ی بین لیبل‌ها
  showName?: boolean; // نمایش نام کالا
  showBarcodeText?: boolean; // نمایش متن کد زیر بارکد
  cropMarks?: boolean; // خط‌چین دور هر لیبل (برای برش)
  /** متن دلخواه مدیر زیر هر لیبل — از تنظیمات چاپ می‌آید. خالی = بدون متن. */
  footerText?: string;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function productLabelBlock(
  l: ProductLabelData,
  barcodeHeightMm: number,
  showName: boolean,
  showText: boolean,
  footerText: string,
): string {
  // ارتفاع بارکد را با ارتفاع لیبل مقیاس می‌دهیم تا در سایزهای مختلف تمیز بماند.
  const bh = Math.round(barcodeHeightMm * 3.78); // mm → px تقریبی برای JsBarcode
  return `
<div class="label">
  ${showName ? `<div class="product-name">${escapeHtml(l.name)}</div>` : ''}
  <svg class="barcode" jsbarcode-value="${escapeHtml(l.barcode)}"
    jsbarcode-height="${bh}" jsbarcode-width="1.6" jsbarcode-margin="0"></svg>
  ${showText ? `<div class="barcode-text">${escapeHtml(l.barcode)}</div>` : ''}
  ${footerText ? `<div class="footer-text">${escapeHtml(footerText)}</div>` : ''}
</div>
`;
}

export function buildProductSheetLabelHtml(
  labels: ProductLabelData[],
  opts: ProductSheetOptions = {},
): string {
  const columns = Math.max(1, Math.min(6, opts.columns ?? 3));
  const copies = Math.max(1, Math.min(500, opts.copies ?? 1));
  const w = Math.max(20, opts.widthMm ?? 50);
  const h = Math.max(15, opts.heightMm ?? 30);
  const gap = opts.gapMm ?? 4;
  const showName = opts.showName ?? true;
  const showText = opts.showBarcodeText ?? true;
  const footerText = (opts.footerText ?? '').trim();
  const border = (opts.cropMarks ?? true) ? '1px dashed #bbb' : 'none';
  // اگر متنِ پاورقی هست، از بودجه‌ی بارکد کم می‌کنیم تا همه‌چیز داخل لیبل بماند.
  const barcodeH = Math.max(
    6,
    Math.round(h * (showName ? 0.34 : 0.5)) -
      (footerText ? Math.round(h * 0.12) : 0),
  );
  const nameSize = h <= 25 ? 8 : 10;

  // هر لیبل × تعداد کپی → صاف می‌شود
  const expanded = labels.flatMap((l) =>
    Array.from({ length: copies }, () => l),
  );
  const cards = expanded
    .map((l) => productLabelBlock(l, barcodeH, showName, showText, footerText))
    .join('\n');

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8"/>
<style>
@page { size: A4; margin: 6mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ${FONT_STACK}; background: white; }
.grid {
  display: grid;
  grid-template-columns: repeat(${columns}, ${w}mm);
  gap: ${gap}mm;
  justify-content: center;
}
.label {
  width: ${w}mm;
  height: ${h}mm;
  border: ${border};
  border-radius: 1.5mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5mm;
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}
.product-name {
  font-size: ${nameSize}pt;
  font-weight: 600;
  text-align: center;
  line-height: 1.25;
  max-height: ${Math.round(h * 0.4)}mm;
  overflow: hidden;
}
.barcode { width: 96%; margin-top: 1mm; }
.barcode-text {
  font-size: 7pt;
  margin-top: 0.5mm;
  direction: ltr;
  letter-spacing: 0.5px;
  font-family: monospace;
}
.footer-text {
  font-size: 7pt;
  font-weight: 600;
  margin-top: 0.5mm;
  text-align: center;
  line-height: 1.2;
  max-height: ${Math.max(2, Math.round(h * 0.14))}mm;
  overflow: hidden;
}
</style>
</head>
<body>
<div class="grid">
${cards}
</div>
<script>${loadJsBarcodeSource()}</script>
<script>${BARCODE_SCRIPT}</script>
</body>
</html>
`;
}

/*
 * چاپِ رول حرارتی به‌صورت PDF: هر صفحه = یک تکه‌ی رول (عرض رول × ارتفاع لیبل)،
 * و روی آن به‌اندازه‌ی floor(عرض رول / عرض لیبل) لیبل کنار هم.
 *
 * چرا @page با اندازه‌ی رول؟ چون پرینترِ حرارتی صفحات را یکی‌یکی به‌عنوان
 * «تکه‌ی رول» بیرون می‌دهد. اگر PDF در ابعادِ رول ساخته نشود، درایور یا
 * مقیاس می‌کند یا می‌بُرد — همان مشکلی که لیبلِ کوچکِ وسطِ برگه را می‌داد.
 * چاپ باید با Scale=100% و بدون هدر/فوتر انجام شود؛ کادرِ خط‌چین هم فقط
 * راهنمای جای لیبل است و روی لیبلِ بریده دیده نمی‌شود.
 */
export interface RollSheetOptions {
  widthMm: number; // عرض هر لیبل (مثلاً ۵۱)
  heightMm: number; // ارتفاع لیبل/تکه‌ی رول (مثلاً ۳۲)
  mediaWidthMm?: number | null; // عرض کل رول (مثلاً ۱۰۵)
  showName?: boolean;
  showBarcodeText?: boolean;
  footerText?: string;
}

export function buildRollLabelHtml(
  labels: ProductLabelData[],
  opts: RollSheetOptions,
): string {
  const w = Math.max(20, Math.round(opts.widthMm));
  const h = Math.max(15, Math.round(opts.heightMm));
  const mediaW = Math.max(
    w,
    Math.round(opts.mediaWidthMm && opts.mediaWidthMm >= w ? opts.mediaWidthMm : w),
  );
  const cols = Math.max(1, Math.floor(mediaW / w));
  const showName = opts.showName ?? true;
  const showText = opts.showBarcodeText ?? true;
  const footerText = (opts.footerText ?? '').trim();

  const nameSize = h <= 25 ? 8 : 10;
  const barcodeH = Math.max(
    6,
    Math.round(h * (showName ? 0.38 : 0.52)) -
      (footerText ? Math.round(h * 0.12) : 0),
  );

  const cards = labels
    .map((l) => productLabelBlock(l, barcodeH, showName, showText, footerText))
    .join('\n');

  // صف را به سطرهای «cols تایی» می‌بُریم — هر سطر یک تکه‌ی رول؛
  // اگر آخرین سطر ناقص بود، خانه‌های خالی سفید می‌مانند (لیبلِ خالی می‌سوزد).
  const rows: string[] = [];
  for (let i = 0; i < labels.length; i += cols) {
    const slice = labels.slice(i, i + cols);
    const cells = slice
      .map(
        (l) =>
          `<div class="cell">${productLabelBlock(
            l,
            barcodeH,
            showName,
            showText,
            footerText,
          )}</div>`,
      )
      .join('\n');
    rows.push(`<div class="row">${cells}</div>`);
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8"/>
<title>لیبل رول حرارتی — ${mediaW}×${h}mm</title>
<style>
@page { size: ${mediaW}mm ${h}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${mediaW}mm; }
body { font-family: ${FONT_STACK}; background: white; }
.row {
  width: ${mediaW}mm;
  height: ${h}mm;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  break-after: page;
  page-break-after: always;
}
.row:last-child { break-after: auto; page-break-after: auto; }
.cell {
  width: ${w}mm;
  height: ${h}mm;
  border: 1px dashed #bbb;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.label {
  width: ${w}mm;
  height: ${h}mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5mm;
  overflow: hidden;
}
.product-name {
  font-size: ${nameSize}pt;
  font-weight: 600;
  text-align: center;
  line-height: 1.25;
  max-height: ${Math.round(h * 0.4)}mm;
  overflow: hidden;
}
.barcode { width: 96%; margin-top: 1mm; }
.barcode-text {
  font-size: 7pt;
  margin-top: 0.5mm;
  direction: ltr;
  letter-spacing: 0.5px;
  font-family: monospace;
}
.footer-text {
  font-size: 7pt;
  font-weight: 600;
  margin-top: 0.5mm;
  text-align: center;
  line-height: 1.2;
  max-height: ${Math.max(2, Math.round(h * 0.14))}mm;
  overflow: hidden;
}
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
${rows.join('\n')}
<script>${loadJsBarcodeSource()}</script>
<script>${BARCODE_SCRIPT}</script>
</body>
</html>
`;
}

/*
 * برگهٔ «نیم‌برگ» برای لیبلِ موقعیت — هر لیبل دقیقاً نیمی از کاغذ.
 *
 * چرا سمتِ سرور و HTML کامل؟ چون چاپِ داخلِ دیالوگ (CSS visibility روی صفحهٔ
 * ادمین) برای اندازهٔ دقیقِ کاغذ قابلِ اعتماد نیست — کاربر لیبلِ کوچکِ وسطِ
 * برگه می‌گرفت. همین مسیرِ چاپِ PDFِ کالا (صفحهٔ مستقل که در تبِ نو باز
 * می‌شود) اندازهٔ کاغذ را درست می‌دهد: A5 → دو لیبلِ ۱۴۸×۱۰۵ یعنی دقیقاً دو A6.
 */
export interface HalfSheetLocationOptions {
  /** کاغذِ برگه. هر لیبل نیمی از آن می‌شود. */
  paper?: LabelPaper;
  /** خط‌چینِ وسط برای راهنمای برش — در چاپ نمی‌آید مگر روشن شود. */
  cutGuide?: boolean;
}

export function buildHalfSheetLocationHtml(
  labels: LabelData[],
  opts: HalfSheetLocationOptions = {},
): string {
  const paper = opts.paper ?? 'A5';
  const sheetW = PAPER_WIDTH_MM[paper];
  const sheetH = Math.round(paper === 'A4' ? 297 : paper === 'A5' ? 210 : 148);
  const halfH = Math.floor(sheetH / 2);
  const cutGuide = opts.cutGuide ?? false;

  /*
   * لیبلِ نیم‌برگ «کیوآر-محور» است: ۸۰٪ کارت کیوآر کد و باقی آدرسِ لوکیشن.
   * هدفِ مدیر: بارکدِ قفسه از دور خوانده شود و بقیه‌ی کارت فقط آدرس را بگوید.
   */
  const padMm = 4;
  const availH = Math.max(30, halfH - padMm * 2);
  const qrMm = Math.max(30, Math.round(availH * 0.8));
  const addressH = availH - qrMm;
  // آدرسِ پایین در ارتفاعِ باقی‌مانده باید خوانا بماند: نام درشت‌تر، مسیر ریزتر.
  const nameSize = Math.max(11, Math.min(20, Math.round(addressH * 0.55)));
  const pathSize = Math.max(8, Math.round(nameSize * 0.72));

  const cards = labels
    .map(
      (l) => `
<div class="label">
  <div class="qr"><img src="${l.qrCode}" /></div>
  <div class="address">
    <div class="name">${escapeHtml(l.name)}</div>
    ${l.pathText ? `<div class="path">${escapeHtml(l.pathText)}</div>` : ''}
  </div>
</div>`,
    )
    .join('\n');

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8"/>
<title>لیبل قفسه — نیم‌برگ</title>
<style>
@page { size: ${paper}; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${sheetW}mm; }
body { font-family: ${FONT_STACK}; background: white; }
.label {
  width: ${sheetW}mm;
  height: ${halfH}mm;
  padding: ${padMm}mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  text-align: center;
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}${
    cutGuide
      ? `
.label + .label { border-top: 1px dashed #aaa; }`
      : `
.label + .label { border-top: none; }`
  }
.qr {
  width: 100%;
  height: ${qrMm}mm;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr img { width: ${qrMm}mm; height: ${qrMm}mm; }
.address {
  width: 100%;
  height: ${Math.max(14, addressH)}mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1mm;
}
.name {
  font-size: ${nameSize}pt;
  font-weight: 700;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.path {
  font-size: ${pathSize}pt;
  color: #333;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
${cards}
<script>${loadJsBarcodeSource()}</script>
<script>${BARCODE_SCRIPT}</script>
</body>
</html>
`;
}

/*
 * لیبلِ رولِ حرارتی برای **موقعیت‌ها** (قفسه/ردیف/طبقه) — همان منطقِ رولِ کالا:
 * هر صفحه = یک تکه‌ی رول (عرض رول × ارتفاع لیبل) با چند لیبل کنار هم.
 *
 * شکلِ لیبل «کیوآر-محور» است (همان زبانِ نیم‌برگ، در ابعادِ کوچک):
 * کیوآرِ بزرگِ قابلِ اسکن با موبایل یک طرف، کدِ موقعیت درشت و آدرسِ کاملِ
 * (انبار ← … ← قفسه) طرفِ دیگر. با اسکنِ کیوآر، اپ موبایل مستقیم روی همان
 * قفسه می‌رود؛ با چشم هم کد درشت آدرس را لو می‌دهد.
 */
export interface RollLocationOptions {
  widthMm: number; // عرض هر لیبل (مثلاً ۵۱)
  heightMm: number; // ارتفاع لیبل/تکه‌ی رول (مثلاً ۳۲)
  mediaWidthMm?: number | null; // عرض کل رول (مثلاً ۱۰۵)
}

export function buildRollLocationHtml(
  labels: LabelData[],
  opts: RollLocationOptions,
): string {
  const w = Math.max(20, Math.round(opts.widthMm));
  const h = Math.max(15, Math.round(opts.heightMm));
  const mediaW = Math.max(
    w,
    Math.round(opts.mediaWidthMm && opts.mediaWidthMm >= w ? opts.mediaWidthMm : w),
  );
  const cols = Math.max(1, Math.floor(mediaW / w));

  // کیوآرِ مربع تا نزدیکِ کلِ ارتفاعِ لیبل بزرگ می‌شود؛ بقیه‌ی عرض برای متن.
  const qrMm = Math.max(10, h - 4);
  const codeSize = h <= 25 ? 10 : 12;
  const pathSize = h <= 25 ? 6 : 7;

  const locationCard = (l: LabelData): string => `
<div class="label">
  <div class="qr"><img src="${l.qrCode}" alt=""/></div>
  <div class="info">
    <div class="code">${escapeHtml(l.code)}</div>
    ${l.pathText ? `<div class="path">${escapeHtml(l.pathText)}</div>` : ''}
  </div>
</div>`;

  // صف را به سطرهای «cols تایی» می‌بُریم — هر سطر یک تکه‌ی رول؛
  // اگر آخرین سطر ناقص بود، خانه‌های خالی سفید می‌مانند (لیبلِ خالی می‌سوزد).
  const rows: string[] = [];
  for (let i = 0; i < labels.length; i += cols) {
    const slice = labels.slice(i, i + cols);
    const cells = slice
      .map((l) => `<div class="cell">${locationCard(l)}</div>`)
      .join('\n');
    rows.push(`<div class="row">${cells}</div>`);
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8"/>
<title>لیبل قفسه — رول حرارتی ${mediaW}×${h}mm</title>
<style>
@page { size: ${mediaW}mm ${h}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${mediaW}mm; }
body { font-family: ${FONT_STACK}; background: white; }
.row {
  width: ${mediaW}mm;
  height: ${h}mm;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  break-after: page;
  page-break-after: always;
}
.row:last-child { break-after: auto; page-break-after: auto; }
.cell {
  width: ${w}mm;
  height: ${h}mm;
  border: 1px dashed #bbb;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.label {
  width: ${w}mm;
  height: ${h}mm;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 1.5mm;
  gap: 1.5mm;
  overflow: hidden;
}
.qr {
  width: ${qrMm}mm;
  height: ${qrMm}mm;
  flex: 0 0 ${qrMm}mm;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr img { width: ${qrMm}mm; height: ${qrMm}mm; }
.info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.8mm;
}
.code {
  font-size: ${codeSize}pt;
  font-weight: 800;
  direction: ltr;
  letter-spacing: 0.5px;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.path {
  font-size: ${pathSize}pt;
  color: #333;
  line-height: 1.25;
  max-width: 100%;
  max-height: ${Math.round(h * 0.45)}mm;
  overflow: hidden;
}
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
${rows.join('\n')}
</body>
</html>
`;
}
