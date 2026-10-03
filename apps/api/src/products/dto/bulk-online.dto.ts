import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

/**
 * کدام کالاها روی سایت دیده شوند.
 *
 * انتخاب دقیقاً همان شکلِ `BulkPriceSelectDto` است تا مدیر دو زبانِ متفاوت یاد
 * نگیرد: انتخاب دستی، یا برند/دسته/جست‌وجو.
 */
export class BulkOnlineSelectDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /**
   * فقط کالاهایی که قیمت فروش دارند.
   *
   * کالای بی‌قیمت روی سایت اصلاً نمایش داده نمی‌شود (کاتالوگ خودش فیلترش
   * می‌کند)، پس روشن‌کردنش فقط عدد را گمراه‌کننده می‌کند. این گزینه به مدیر
   * اجازه می‌دهد از همان اول فقط کالاهای فروختنی را انتخاب کند.
   */
  @IsOptional()
  @IsBoolean()
  onlyWithSalePrice?: boolean;
}

export class BulkOnlineDto {
  @ValidateNested()
  @Type(() => BulkOnlineSelectDto)
  select: BulkOnlineSelectDto;

  /** true یعنی روی سایت دیده شود. */
  @IsBoolean()
  showOnline: boolean;

  /**
   * فقط بشمار، ننویس.
   *
   * روی ۳۳ هزار کالا، «اعمال کن و ببین چه شد» گران است. مدیر اول عدد را
   * می‌بیند، بعد تأیید می‌کند.
   */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
