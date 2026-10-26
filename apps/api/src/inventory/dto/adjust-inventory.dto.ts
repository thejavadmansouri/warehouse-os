import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/**
 * تعدیلِ دستیِ موجودی یک قفسه (ADJUST).
 *
 * عددِ این مسیر «دلتا» نیست، **موجودیِ مقصد** است: کارگر می‌شمارد ۷ عدد دیده
 * و همان ۷ ثبت می‌شود. پس نامِ فیلد `targetQuantity` است، نه `quantity`.
 *
 * `@IsInt` اینجا فقط لبه‌ی HTTP را می‌بندد؛ گاردِ اصلی در
 * `InventoryOperationService` است تا مسیرهای غیرِ HTTP (sync، صوت، صفِ آفلاین)
 * هم نتوانند عددِ اعشاری وارد کنند. ستون `quantity` در پستگرس `INT4` است و
 * `2.5` را بی‌صدا به `2` گرد می‌کرد — همان باگِ H‑1 گزارشِ QA.
 */
export class AdjustInventoryDto {
  @IsString()
  @IsNotEmpty({ message: 'شناسه کالا الزامی است' })
  productId: string;

  @IsString()
  @IsNotEmpty({ message: 'شناسه موقعیت الزامی است' })
  locationId: string;

  @IsInt({ message: 'موجودی مقصد باید عدد صحیح باشد' })
  @Min(0, { message: 'موجودی مقصد نمی‌تواند منفی باشد' })
  targetQuantity: number;

  @IsOptional()
  @IsString()
  note?: string;
}
