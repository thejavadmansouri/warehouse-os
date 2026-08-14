import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // خطاهای عمدیِ HttpException پیامِ امن دارند و همان status درست را — دست‌نخورده.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(exception.getResponse());
      return;
    }

    // هر چیز دیگر یعنی خطای واقعیِ سرور: ۵۰۰، نه ۴۰۰.
    //
    // پیامِ خام (مسیر فایل، متن کوئری، جزئیات DB) هرگز به کلاینت نمی‌رود — فقط
    // در لاگِ سرور می‌نشیند. قبلاً این‌ها ۴۰۰ با message خام برمی‌گشتند و هم کدِ
    // وضعیت غلط بود، هم داخلِ سیستم درز می‌کرد.
    this.logger.error(
      exception instanceof Error ? exception.stack ?? exception.message : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'خطای غیرمنتظره رخ داد',
    });
  }
}
