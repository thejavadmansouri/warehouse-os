// Generates a 1024x1024 app icon PNG (status-light design) with pure Node.
// No dependencies: hand-rolled PNG encoder.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---- CRC32 (PNG spec) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- Drawing ----
const S = 1024;
const px = Buffer.alloc(S * S * 4);

function blend(x, y, r, g, b, a) {
  const i = (y * S + x) * 4;
  const srcA = a / 255;
  const dstA = px[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  px[i] = Math.round((r * srcA + px[i] * dstA * (1 - srcA)) / outA);
  px[i + 1] = Math.round((g * srcA + px[i + 1] * dstA * (1 - srcA)) / outA);
  px[i + 2] = Math.round((b * srcA + px[i + 2] * dstA * (1 - srcA)) / outA);
  px[i + 3] = Math.round(outA * 255);
}

function circle(cx, cy, radius, r, g, b, a, feather = 0) {
  for (let y = Math.floor(cy - radius - feather); y <= cy + radius + feather; y++) {
    for (let x = Math.floor(cx - radius - feather); x <= cx + radius + feather; x++) {
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= radius - feather) {
        blend(x, y, r, g, b, a);
      } else if (dist <= radius + feather) {
        const t = (radius + feather - dist) / (2 * feather);
        blend(x, y, r, g, b, Math.round(a * Math.max(0, Math.min(1, t))));
      }
    }
  }
}

function roundedRect(x0, y0, x1, y1, rad, r, g, b) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = Math.max(x0 + rad, Math.min(x1 - rad, x));
      const cy = Math.max(y0 + rad, Math.min(y1 - rad, y));
      if (Math.hypot(x - cx, y - cy) <= rad) blend(x, y, r, g, b, 255);
    }
  }
}

// Dark rounded-square background (like a status light housing)
roundedRect(64, 64, 959, 959, 220, 40, 42, 48);
// White ring
circle(512, 512, 330, 255, 255, 255, 255);
// Green inner dot (allowed state)
circle(512, 512, 250, 52, 199, 89, 255, 6);

// macOS icon corners are masked by the OS; add a subtle top highlight
for (let y = 64; y < 300; y++) {
  for (let x = 64; x < 959; x++) {
    const t = (300 - y) / 236;
    const i = (y * S + x) * 4;
    px[i] = Math.min(255, px[i] + Math.round(18 * t));
    px[i + 1] = Math.min(255, px[i + 1] + Math.round(18 * t));
    px[i + 2] = Math.min(255, px[i + 2] + Math.round(22 * t));
  }
}

const out = path.join(__dirname, 'icon-1024.png');
fs.writeFileSync(out, encodePNG(S, S, px));
console.log('wrote', out);