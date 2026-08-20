import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChequeRateMode } from '@prisma/client';

import { INT4_MAX } from '../../common/money';


/** یک شماره در بانک شماره‌ی مشتری. نرمال‌سازی در سرویس انجام می‌شود. */
export class CustomerPhoneDto {

  @IsString()
  phone:string;


  /** موبایل / ثابت / محل کار */
  @IsOptional()
  @IsString()
  label?:string;


  @IsOptional()
  @IsBoolean()
  isPrimary?:boolean;
}


/** ساخت مشتری. فقط نام الزامی است — ثبت بدون شماره باید ممکن باشد. */
export class CreateCustomerDto {

  @IsString()
  firstName:string;


  @IsOptional()
  @IsString()
  lastName?:string;


  @IsOptional()
  @IsString()
  address?:string;


  @IsOptional()
  @IsString()
  nationalId?:string;


  /** ارجاع به دسته‌ی مشتری — باید یک دسته‌ی فعال باشد. */
  @IsOptional()
  @IsString()
  categoryId?:string;


  @IsOptional()
  @IsString()
  note?:string;


  @IsOptional()
  @IsBoolean()
  smsOptOut?:boolean;


  /** سقف اعتبار حساب‌باز (ریال). صفر یعنی «تعیین نشده». */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  creditLimit?:number;


  /** مهلت پرداخت پیش‌فرض به روز. ده سال سقفِ محترمانه‌ای برای «مهلت» است. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  creditDays?:number;

  /**
   * نرخِ تفاوتِ فروشِ مدت‌دار برای چکِ این مشتری، به پایه‌ی هزارم (bp).
   * ۲۵۰ یعنی ۲.۵٪. صفر یعنی «از پیش‌فرضِ فروشگاه بگیر».
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  chequeRateBp?:number;


  @IsOptional()
  @IsEnum(ChequeRateMode)
  chequeRateMode?:ChequeRateMode;


  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CustomerPhoneDto)
  phones?:CustomerPhoneDto[];
}


/**
 * ویرایش مشتری. همه‌چیز اختیاری است و سرویس فقط فیلدهای فرستاده‌شده را دست
 * می‌زند — یعنی نفرستادنِ یک فیلد آن را پاک نمی‌کند.
 */
export class UpdateCustomerDto {

  @IsOptional()
  @IsString()
  firstName?:string;


  @IsOptional()
  @IsString()
  lastName?:string;


  @IsOptional()
  @IsString()
  address?:string;


  @IsOptional()
  @IsString()
  nationalId?:string;


  @IsOptional()
  @IsString()
  categoryId?:string;


  @IsOptional()
  @IsString()
  note?:string;


  @IsOptional()
  @IsBoolean()
  smsOptOut?:boolean;


  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT4_MAX)
  creditLimit?:number;


  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  creditDays?:number;

  /**
   * نرخِ تفاوتِ فروشِ مدت‌دار برای چکِ این مشتری، به پایه‌ی هزارم (bp).
   * ۲۵۰ یعنی ۲.۵٪. صفر یعنی «از پیش‌فرضِ فروشگاه بگیر».
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  chequeRateBp?:number;


  @IsOptional()
  @IsEnum(ChequeRateMode)
  chequeRateMode?:ChequeRateMode;
}
