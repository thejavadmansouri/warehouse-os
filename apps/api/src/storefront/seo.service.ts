import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/** حداکثر URL در یک sitemap طبق استاندارد ۵۰ هزار است؛ ما خیلی پایین‌تریم. */
const MAX_URLS = 5_000;

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  private origin(base?: string): string {
    const raw = (base || process.env.SITE_URL || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  }

  private esc(v: string): string {
    return v.replace(
      /[<>&'"]/g,
      (c) =>
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          "'": '&apos;',
          '"': '&quot;',
        })[c]!,
    );
  }

  /**
   * فقط کالاهایی که واقعاً روی سایت دیده می‌شوند.
   *
   * فرستادن کالای آفلاین به گوگل یعنی ایندکس‌شدن صفحه‌ای که ۴۰۴ می‌دهد، و آن
   * به رتبه‌ی کل دامنه ضربه می‌زند.
   */
  async sitemap(base?: string): Promise<string> {
    const origin = this.origin(base);

    const shop = await this.prisma.shopSettings.findUnique({
      where: { id: 'singleton' },
      select: { onlineEnabled: true },
    });

    // سایتِ خاموش نباید هیچ آدرسی به گوگل بدهد.
    const rows = shop?.onlineEnabled
      ? await this.prisma.product.findMany({
          where: { showOnline: true, isActive: true, deletedAt: null },
          select: {
            id: true,
            updatedAt: true,
            assets: {
              where: { type: 'PRODUCT_IMAGE' },
              select: { path: true },
              take: 1,
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: MAX_URLS,
        })
      : [];

    const url = (loc: string, lastmod?: Date, priority = '0.6') =>
      `  <url>\n    <loc>${this.esc(loc)}</loc>\n` +
      (lastmod
        ? `    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>\n`
        : '') +
      `    <priority>${priority}</priority>\n  </url>`;

    // Image extension so product photos enter Google Images. Paths stored
    // are root-relative (/storage/...) — absolutise against the same origin.
    const urlWithImage = (p: {
      id: string;
      updatedAt: Date;
      assets: { path: string }[];
    }) => {
      const loc = `${origin}/shop/product/${p.id}`;
      const img = p.assets[0]?.path
        ? `\n    <image:image>\n      <image:loc>${this.esc(
            origin + p.assets[0].path,
          )}</image:loc>\n    </image:image>`
        : '';
      return (
        `  <url>\n    <loc>${this.esc(loc)}</loc>\n` +
        `    <lastmod>${p.updatedAt.toISOString().slice(0, 10)}</lastmod>\n` +
        img +
        `\n    <priority>0.6</priority>\n  </url>`
      );
    };

    const entries = [
      url(`${origin}/`, undefined, '1.0'),
      ...rows.map((p) => urlWithImage(p)),
    ];

    const imageNs =
      ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${rows.length ? imageNs : ''}>\n` +
      entries.join('\n') +
      '\n</urlset>\n'
    );
  }

  /**
   * وقتی سایت خاموش است، `Disallow: /` می‌دهیم.
   *
   * نصبی که هرگز قرار نیست سایت داشته باشد نباید کاتالوگش را به موتور جستجو
   * بدهد — و مسیرهای داخلی هم در هیچ حالتی نباید crawl شوند.
   */
  async robots(base?: string): Promise<string> {
    const origin = this.origin(base);
    const shop = await this.prisma.shopSettings.findUnique({
      where: { id: 'singleton' },
      select: { onlineEnabled: true },
    });

    if (!shop?.onlineEnabled) {
      return 'User-agent: *\nDisallow: /\n';
    }

    return [
      'User-agent: *',
      'Allow: /',
      // پنل مدیر و مسیرهای شخصیِ مشتری هیچ‌وقت نباید ایندکس شوند.
      'Disallow: /panel.html',
      'Disallow: /shop/me',
      'Disallow: /shop/orders',
      'Disallow: /site-admin/',
      '',
      ...(origin ? [`Sitemap: ${origin}/sitemap.xml`] : []),
      '',
    ].join('\n');
  }
}
