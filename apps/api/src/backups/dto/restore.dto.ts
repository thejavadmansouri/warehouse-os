import { Equals, IsString } from 'class-validator';


/** عبارتی که مدیر باید تایپ کند. دکمه‌ی ساده برای این کار کافی نیست. */
export const RESTORE_CONFIRM_PHRASE = 'بازیابی';


/**
 * بازیابیِ دیتابیس.
 *
 * `confirm` عمداً بخشی از بدنه است نه یک چک‌باکسِ سمت کلاینت: هر کلاینتی —
 * از جمله یک درخواستِ اشتباهیِ تکراری — باید صراحتاً همین عبارت را بفرستد.
 * این تنها اندپوینتی است که کلِ داده‌ی سیستم را جایگزین می‌کند.
 */
export class RestoreDto {

  @IsString()
  fileName:string;


  @Equals(RESTORE_CONFIRM_PHRASE, {
    message: `برای تأیید باید عبارت «${RESTORE_CONFIRM_PHRASE}» را بنویسید`,
  })
  confirm:string;
}
