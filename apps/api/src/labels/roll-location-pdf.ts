/**
 * PDF واقعی رول قفسه — همان هندسهٔ Desktop `100200_big.pdf` / build_100200.js.
 * هر صفحه = عرض رول × ارتفاع برچسب؛ چند سلول مساوی؛ QR چپ + عدد Helvetica-Bold راست.
 */
import * as zlib from 'zlib';
import sharp from 'sharp';

const PT_PER_MM = 72 / 25.4;

export interface RollLocationPdfLabel {
  qrCode: string; // data:image/png;base64,...
  shortNum?: string;
  code: string;
}

export interface RollLocationPdfOptions {
  widthMm: number;
  heightMm: number;
  mediaWidthMm?: number | null;
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function parseDataUrlPng(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim());
  if (!m?.[1]) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
}

async function pngToRgbFlate(
  png: Buffer,
): Promise<{ w: number; h: number; raw: Buffer } | null> {
  try {
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels < 3) return null;
    // DeviceRGB expects 3 bytes/pixel
    let rgb: Buffer;
    if (info.channels === 3) {
      rgb = data;
    } else {
      rgb = Buffer.alloc(info.width * info.height * 3);
      for (let i = 0, j = 0; i < data.length; i += info.channels, j += 3) {
        rgb[j] = data[i]!;
        rgb[j + 1] = data[i + 1]!;
        rgb[j + 2] = data[i + 2]!;
      }
    }
    return {
      w: info.width,
      h: info.height,
      raw: zlib.deflateSync(rgb),
    };
  } catch {
    return null;
  }
}

/**
 * می‌سازد: Buffer فایل PDF-1.5 با MediaBox میلی‌متری دقیق.
 */
export async function buildRollLocationPdf(
  labels: RollLocationPdfLabel[],
  opts: RollLocationPdfOptions,
): Promise<Buffer> {
  const stickerW = Math.max(18, Math.round(opts.widthMm));
  const hMm = Math.max(15, Math.round(opts.heightMm));
  const mediaW = Math.max(
    stickerW,
    Math.round(
      opts.mediaWidthMm && opts.mediaWidthMm >= stickerW
        ? opts.mediaWidthMm
        : 104,
    ),
  );
  // مثل 100200: تقسیم مساوی عرض رول، نه چسباندن سلول‌های ثابت با لبهٔ خالی.
  const cols = Math.max(1, Math.floor(mediaW / stickerW));
  const cellWmm = mediaW / cols;

  const pageW = mediaW * PT_PER_MM;
  const pageH = hMm * PT_PER_MM;
  const cellW = cellWmm * PT_PER_MM;
  const qrSize = Math.min(19 * PT_PER_MM, (hMm - 4.4) * PT_PER_MM);
  const margin = 2.2 * PT_PER_MM;
  const gap = 2.0 * PT_PER_MM;
  const qrY = (pageH - qrSize) / 2;

  type ObjBody = string;
  const objs: ObjBody[] = [];
  const addObj = (body: string): number => {
    objs.push(body);
    return objs.length;
  };

  const fontId = addObj(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  const pagesId = addObj('PLACEHOLDER');
  const pageIds: number[] = [];

  // QR decode cache by dataUrl
  const imgCache = new Map<string, { id: number; w: number; h: number }>();

  const pageCount = Math.max(1, Math.ceil(labels.length / cols));
  for (let p = 0; p < pageCount; p++) {
    const slice = labels.slice(p * cols, p * cols + cols);
    if (slice.length === 0) break;

    const content: string[] = [];
    const xobjects: string[] = [];

    for (let i = 0; i < slice.length; i++) {
      const lab = slice[i]!;
      const cellX = i * cellW;
      const png = parseDataUrlPng(lab.qrCode);
      if (png) {
        let cached = imgCache.get(lab.qrCode);
        if (!cached) {
          const rgb = await pngToRgbFlate(png);
          if (rgb) {
            const id = addObj(
              `<< /Type /XObject /Subtype /Image /Width ${rgb.w} /Height ${rgb.h} ` +
                `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
                `/Length ${rgb.raw.length} >>\nstream\n` +
                rgb.raw.toString('latin1') +
                '\nendstream',
            );
            cached = { id, w: rgb.w, h: rgb.h };
            imgCache.set(lab.qrCode, cached);
          }
        }
        if (cached) {
          const name = `Im${cached.id}`;
          xobjects.push(`/${name} ${cached.id} 0 R`);
          content.push('q');
          content.push(
            `${qrSize.toFixed(3)} 0 0 ${qrSize.toFixed(3)} ${(cellX + margin).toFixed(3)} ${qrY.toFixed(3)} cm`,
          );
          content.push(`/${name} Do`);
          content.push('Q');
        }
      }

      const text = String(lab.shortNum || lab.code || '').trim() || '?';
      const areaX0 = cellX + margin + qrSize + gap;
      const areaX1 = cellX + cellW - margin;
      const areaW = Math.max(4, areaX1 - areaX0);
      const nDigits = text.length || 1;
      const size = Math.min(24, areaW / (nDigits * 0.556));
      const textW = nDigits * 0.556 * size;
      const tx = areaX0 + (areaW - textW) / 2;
      const baseline = (pageH - size * 0.72) / 2;
      content.push('BT');
      content.push(`/F1 ${size.toFixed(2)} Tf`);
      content.push(`${tx.toFixed(3)} ${baseline.toFixed(3)} Td`);
      content.push(`(${pdfEscape(text)}) Tj`);
      content.push('ET');
    }

    const streamBody = content.join('\n') + '\n';
    const compressed = zlib.deflateSync(Buffer.from(streamBody, 'latin1'));
    const contentId = addObj(
      `<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n` +
        compressed.toString('latin1') +
        '\nendstream',
    );

    const xo =
      xobjects.length > 0 ? `/XObject << ${xobjects.join(' ')} >>` : '';
    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> ${xo} >> ` +
        `/Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  if (pageIds.length === 0) {
    throw new Error('هیچ صفحه‌ای برای PDF رول ساخته نشد');
  }

  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  objs[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [ ${kids} ] >>`;
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = '%PDF-1.5\n%\xE2\xE3\xCF\xD3\n';
  const xrefOffsets: number[] = [];
  for (let i = 0; i < objs.length; i++) {
    xrefOffsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of xrefOffsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}
