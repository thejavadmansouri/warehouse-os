import { Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LabelsService {
  constructor(private prisma: PrismaService) {}

  // کد داخل QR همیشه فقط همون بارکد کوتاهه (مثلاً LOC000123) — ساده و سریع اسکن می‌شه.
  private async qr(text: string): Promise<string> {
    return QRCode.toDataURL(text, { margin: 1, width: 300 });
  }

  // برای قفسه: مسیر کامل (انبار > ردیف > قفسه) از پایگاه‌داده ساخته می‌شه
  // تا روی لیبل به‌صورت متن خوانا چاپ بشه، نه داخل خود کد.
  async locationLabel(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: { type: true, warehouse: true },
    });
    if (!location) throw new NotFoundException('موقعیت پیدا نشد');

    const path: { id: string; name: string }[] = [];
    let current: any = location;
    while (current) {
      path.unshift({ id: current.id, name: current.name });
      if (!current.parentId) break;
      current = await this.prisma.location.findUnique({ where: { id: current.parentId } });
    }

    return {
      id: location.id,
      name: location.name,
      code: location.code,
      barcode: location.barcode,
      warehouseName: location.warehouse?.name ?? null,
      path, // [{id,name}, ...] از ریشه تا خود قفسه
      pathText: path.map((p) => p.name).join(' › '),
      qrCode: await this.qr(location.barcode),
    };
  }

  async productLabel(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { brand: true, vehicleModel: true },
    });
    if (!product) throw new NotFoundException('کالا پیدا نشد');

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      brandName: product.brand?.name ?? null,
      vehicleModelName: product.vehicleModel?.name ?? null,
      barcode: product.internalBarcode,
      qrCode: await this.qr(product.internalBarcode),
    };
  }

  // چاپ دسته‌ای — چند لیبل قفسه یا کالا با هم
  async bulkLocationLabels(ids: string[]) {
    return Promise.all(ids.map((id) => this.locationLabel(id)));
  }

  async bulkProductLabels(ids: string[]) {
    return Promise.all(ids.map((id) => this.productLabel(id)));
  }
}
