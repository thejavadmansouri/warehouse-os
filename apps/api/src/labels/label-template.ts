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


  throw new Error(
    'فایل JsBarcode پیدا نشد',
  );

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



const FONT_STACK =
`'Vazirmatn','IRANSans',Tahoma,'Geeza Pro',sans-serif`;



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






export function buildThermalLabelHtml(
  l: LabelData,
  widthPx = 384
): string {


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
  columns?: number;      // تعداد ستون در هر ردیف
  copies?: number;       // چند کپی از هر لیبل (پیش‌فرض ۱)
  widthMm?: number;      // عرض هر لیبل
  heightMm?: number;     // ارتفاع هر لیبل
  gapMm?: number;        // فاصله‌ی بین لیبل‌ها
  showName?: boolean;    // نمایش نام کالا
  showBarcodeText?: boolean; // نمایش متن کد زیر بارکد
  cropMarks?: boolean;   // خط‌چین دور هر لیبل (برای برش)
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
): string {
  // ارتفاع بارکد را با ارتفاع لیبل مقیاس می‌دهیم تا در سایزهای مختلف تمیز بماند.
  const bh = Math.round(barcodeHeightMm * 3.78); // mm → px تقریبی برای JsBarcode
  return `
<div class="label">
  ${showName ? `<div class="product-name">${escapeHtml(l.name)}</div>` : ''}
  <svg class="barcode" jsbarcode-value="${escapeHtml(l.barcode)}"
    jsbarcode-height="${bh}" jsbarcode-width="1.6" jsbarcode-margin="0"></svg>
  ${showText ? `<div class="barcode-text">${escapeHtml(l.barcode)}</div>` : ''}
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
  const border = (opts.cropMarks ?? true) ? '1px dashed #bbb' : 'none';
  const barcodeH = Math.max(6, Math.round(h * (showName ? 0.34 : 0.5)));
  const nameSize = h <= 25 ? 8 : 10;

  // هر لیبل × تعداد کپی → صاف می‌شود
  const expanded = labels.flatMap((l) => Array.from({ length: copies }, () => l));
  const cards = expanded
    .map((l) => productLabelBlock(l, barcodeH, showName, showText))
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