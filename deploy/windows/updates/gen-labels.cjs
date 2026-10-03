/*
 * Generate a 2-up TSPL label file for the TSC TTP-244 Pro.
 *
 * Roll: 105 mm wide, die-cut into two 51x32 mm labels side by side.
 * Each label: Persian name (bitmap, right-aligned) + CODE128 barcode (SKU).
 *
 * SKUs are taken from the FINAL900.pdf text dump; product names come from
 * the app database (same machine). Output: kardo-labels.prn
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PSQL = String.raw`C:\Program Files\PostgreSQL\17\bin\psql.exe`;
const PW = "123456";
const DB = "warehouse_os";

// ---- 1. SKUs from the PDF -------------------------------------------------
const txt = fs.readFileSync("C:\\Users\\K\\AppData\\Local\\Temp\\final900.txt", "utf8");
const skus = [...new Set(txt.match(/\b1[0-9]{6,9}\b/g) || [])].sort();
console.log("unique SKUs in PDF:", skus.length);

// ---- 2. names from DB ------------------------------------------------------
const list = skus.map((s) => `'${s}'`).join(",");
const sqlFile = path.join(__dirname, "query.sql");
fs.writeFileSync(sqlFile, `SET client_encoding='UTF8';
SELECT p.sku || '|' || COALESCE(vm.name,'') || '|' || p.name
  FROM "Product" p LEFT JOIN "VehicleModel" vm ON vm.id = p."vehicleModelId"
  WHERE p.sku IN (${list}) AND p."deletedAt" IS NULL ORDER BY p.sku;
`);
const raw = execSync(`"${PSQL}" -U postgres -h 127.0.0.1 -d ${DB} -t -A -f "${sqlFile}"`, {
  env: { ...process.env, PGPASSWORD: PW },
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const rows = raw.split("\n").filter((l) => l.includes("|")).map((l) => {
  const i = l.indexOf("|");
  const j = l.indexOf("|", i + 1);
  return { sku: l.slice(0, i), model: l.slice(i + 1, j), name: l.slice(j + 1) };
});
console.log("matched in DB:", rows.length);

// ---- 3. TSPL builder (faithful port of apps/api tspl.service.ts) ----------
const DOTS = 8; // 203 dpi
const mm = (v) => Math.round(v * DOTS);
const WIDTH_MM = 51, HEIGHT_MM = 32, GAP_MM = 2, MEDIA_MM = 105;

const wDots = WIDTH_MM * DOTS;      // 408
const hDots = HEIGHT_MM * DOTS;     // 256
const nameTop = mm(1.5);            // 12
const nameH = 7 * DOTS;             // 56
const barcodeTop = nameTop + nameH + mm(1); // 76
const hriDots = 24;
const bottomMargin = mm(1);         // 8
const barcodeH = Math.max(40, hDots - barcodeTop - hriDots - bottomMargin); // 148
const maxNameW = wDots - mm(2) * 2; // 376

async function renderPersian(text, maxW, maxH) {
  const sharp = require("C:\\warehouse-os\\node_modules\\sharp");
  const esc = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const png = await sharp({
    text: {
      text: esc(text),
      font: "Vazirmatn, Tahoma, DejaVu Sans, sans-serif",
      width: maxW, height: maxH, align: "right", rgba: false,
    },
  }).greyscale().png().toBuffer();
  const { data, info } = await sharp(png)
    .resize({ width: maxW, height: maxH, fit: "contain", position: "right", background: { r: 0, g: 0, b: 0 } })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const widthBytes = Math.ceil(info.width / 8);
  const out = Buffer.alloc(widthBytes * info.height, 0xff);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const lit = data[y * info.width + x] > 127;
      if (!lit) continue;
      out[y * widthBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return { widthBytes, height: info.height, data: out };
}

function bitmapCmd(x, y, b) {
  const header = Buffer.from(`BITMAP ${x},${y},${b.widthBytes},${b.height},0,`, "latin1");
  return Buffer.concat([header, b.data, Buffer.from("\r\n", "latin1")]);
}

// ---- 4. build the 2-up payload ---------------------------------------------
(async () => {
  const sharp = require("C:\\warehouse-os\\node_modules\\sharp");
  const cols = Math.floor(MEDIA_MM / WIDTH_MM); // 2
  const parts = [];
  let segCount = 0;

  for (let i = 0; i < rows.length; i += cols) {
    const row = rows.slice(i, i + cols);
    const seg = [`SIZE ${MEDIA_MM} mm,${HEIGHT_MM} mm\r\n`, "GAP 2 mm,0 mm\r\n", "DIRECTION 1\r\n", "CLS\r\n"];
    for (let slot = 0; slot < cols; slot++) {
      const xOffset = slot * wDots;
      if (slot >= row.length) continue; // odd count -> last slot empty
      const p = row[slot];
      const name = p.model && !p.name.startsWith(p.model) ? `${p.model} — ${p.name}` : p.name;
      const bmp = await renderPersian(name, maxNameW, nameH);
      seg.push(bitmapCmd(xOffset + mm(2), nameTop, bmp));
      seg.push(`BARCODE ${xOffset + mm(2)},${barcodeTop},"128",${barcodeH},2,0,2,2,2,"${p.sku}"\r\n`);
    }
    seg.push("PRINT 1,1\r\n");
    parts.push(...seg);
    segCount++;
  }

  const payload = Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : p)));
  const outPath = "C:\\Users\\K\\Desktop\\kardo-labels.prn";
  fs.writeFileSync(outPath, payload);
  console.log("segments:", segCount, "labels:", rows.length);
  console.log("bytes:", payload.length, "->", outPath);
})();
