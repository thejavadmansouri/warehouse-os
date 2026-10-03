import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * تأییدِ گروهیِ عملیاتِ در انتظار. سقفِ ۱۰۰۰ تا از denial-of-service روی یک
 * درخواست جلوگیری می‌کند (هر id یک commitِ موجودیِ ترتیبی است). UI معمولاً
 * فقط آیتم‌های «آماده» (محصولِ resolved‌شده) را می‌فرستد.
 */
export class ApproveManyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  ids: string[];
}
