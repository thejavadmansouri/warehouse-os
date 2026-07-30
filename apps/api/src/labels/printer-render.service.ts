import { Injectable, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';

@Injectable()
export class PrinterRenderService implements OnModuleDestroy {
  private browser: Browser | null = null;


  async onModuleDestroy() {
    await this.browser?.close();
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    }
    return this.browser;
  }

  // برای لیبل تکی (حرارتی/بلوتوث): فقط دور همون یک لیبل کراپ می‌کنیم،
  // نه کل صفحه — عرض دقیقاً به پیکسل چاپگر ست می‌شه (۱ پیکسل = ۱ نقطه‌ی چاپگر).
  async renderPng(html: string, widthPx: number): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: widthPx, height: 200, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await new Promise(resolve => setTimeout(resolve, 500));
      const el = await page.$('#label-root');
      const buffer = await (el ?? page).screenshot({ type: 'png' });
      return buffer as Buffer;
    } finally {
      await page.close();
    }
  }

  async renderPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await new Promise(resolve => setTimeout(resolve, 500));
      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      return buffer as Buffer;
    } finally {
      await page.close();
    }
  }
}
