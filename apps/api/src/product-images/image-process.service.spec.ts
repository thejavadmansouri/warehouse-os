import sharp from 'sharp';

import { ImageProcessService } from './image-process.service';

/** A real 1200x900 JPEG: blue box on a light background, like a shelf photo. */
async function makePhoto(): Promise<Buffer> {
  const svg = [
    '<svg width="1200" height="900">',
    '<rect x="350" y="200" width="500" height="500" rx="40" fill="#1d4ed8"/>',
    '<text x="600" y="470" font-size="90" text-anchor="middle" fill="white" font-family="Arial">1230421</text>',
    '</svg>',
  ].join('');
  return sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: { r: 240, g: 235, b: 225 },
    },
  })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('ImageProcessService (putaway photo pipeline)', () => {
  const service = new ImageProcessService();
  let photo: Buffer;

  beforeAll(async () => {
    photo = await makePhoto();
  });

  it('emits three WebP sizes on square white canvases', async () => {
    const set = await service.processImage(photo, null);
    expect(set.master.format).toBe('webp');
    expect([set.master.width, set.master.height]).toEqual([1200, 1200]);
    expect([set.product.width, set.product.height]).toEqual([800, 800]);
    expect([set.thumbnail.width, set.thumbnail.height]).toEqual([300, 300]);
    // White canvas corner, blue product centre — the pipeline signature.
    const { data, info } = await sharp(set.product.buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    expect(px(5, 5)).toEqual([255, 255, 255]);
    // Centre must be product-coloured, not canvas white.
    expect(px(400, 400)).not.toEqual([255, 255, 255]);
  });

  it('burns the shop watermark into master and product, never the thumb', async () => {
    const wm = {
      enabled: true,
      text: 'TEST-WM',
      opacity: 30,
      position: 'bottom-right' as const,
    };
    const plain = await service.processImage(photo, null);
    const marked = await service.processImage(photo, wm);
    // Same source, same sizes — only the watermark differs.
    expect(marked.product.width).toBe(plain.product.width);
    expect(marked.product.buffer.equals(plain.product.buffer)).toBe(false);
    expect(marked.master.buffer.equals(plain.master.buffer)).toBe(false);
    // parseable WebP either way
    for (const img of [marked.master, marked.product, marked.thumbnail]) {
      const meta = await sharp(img.buffer).metadata();
      expect(meta.format).toBe('webp');
    }
  });

  it('leaves bytes alone when the watermark is disabled or blank', async () => {
    const a = await service.processImage(photo, null);
    const b = await service.processImage(photo, {
      enabled: false,
      text: 'TEST-WM',
      opacity: 30,
      position: 'bottom-right',
    });
    const c = await service.processImage(photo, {
      enabled: true,
      text: '   ',
      opacity: 30,
      position: 'bottom-right',
    });
    expect(b.product.buffer.equals(a.product.buffer)).toBe(true);
    expect(c.product.buffer.equals(a.product.buffer)).toBe(true);
  });

  it('builds a stable latin SEO slug from a Persian name', () => {
    expect(service.seoFileBase('1230421', 'لنت جلو پراید')).toBe(
      '1230421-lnt-jlv-prayd',
    );
    // Same name twice -> same base (the timestamp suffix is added by the caller).
    expect(service.seoFileBase('1230421', 'لنت جلو پراید')).toBe(
      service.seoFileBase('1230421', 'لنت جلو پراید'),
    );
  });

  it('rejects garbage and tiny images', async () => {
    await expect(service.validateImage(Buffer.alloc(64))).resolves.toMatchObject({
      valid: false,
    });
    const tiny = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();
    await expect(service.validateImage(tiny)).resolves.toMatchObject({
      valid: false,
    });
    await expect(service.validateImage(photo)).resolves.toMatchObject({
      valid: true,
    });
  });
});
