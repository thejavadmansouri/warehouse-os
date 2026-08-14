import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';


const SINGLETON = 'singleton';


/** مشخصات مغازه — روی سربرگ همه‌ی برگه‌های چاپی. */
export interface ShopSettingsInput {
  name?: string;
  phone?: string;
  address?: string;
  cardNumber?: string;
  cardHolder?: string;
  footer?: string;
}


@Injectable()
export class ShopService {

  constructor(private readonly prisma: PrismaService) {}


  /**
   * خواندن تنظیمات.
   *
   * اگر ردیف نبود ساخته می‌شود، تا صفحه‌ی چاپ هیچ‌وقت با «تنظیمات پیدا نشد»
   * روبه‌رو نشود — برگه باید حتی روی نصبِ تازه هم چاپ شود.
   */
  async get() {
    return this.prisma.shopSettings.upsert({
      where: { id: SINGLETON },
      update: {},
      create: { id: SINGLETON },
    });
  }


  async update(input: ShopSettingsInput) {
    const data = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
      ...(input.address !== undefined ? { address: input.address.trim() } : {}),
      // فاصله و خط تیره‌ی شماره کارت حذف می‌شود تا نمایشش همه‌جا یکدست باشد.
      ...(input.cardNumber !== undefined
        ? { cardNumber: input.cardNumber.replace(/[\s-]/g, '') }
        : {}),
      ...(input.cardHolder !== undefined
        ? { cardHolder: input.cardHolder.trim() }
        : {}),
      ...(input.footer !== undefined ? { footer: input.footer.trim() } : {}),
    };

    return this.prisma.shopSettings.upsert({
      where: { id: SINGLETON },
      update: data,
      create: { id: SINGLETON, ...data },
    });
  }
}
