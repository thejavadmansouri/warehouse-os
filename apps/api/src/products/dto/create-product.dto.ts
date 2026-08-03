import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateProductDto {

  @IsString()
  name: string;

  /**
   * کد کالا = کد حسابداری. اگر داده نشود، سیستم عدد بعدی دنباله را می‌دهد،
   * چون همین عدد روی لیبل به‌صورت بارکد چاپ می‌شود و کالای بی‌کد قابل
   * برچسب‌زدن نیست.
   */
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  internalBarcode?: string;

  @IsOptional()
  @IsString()
  factoryBarcode?: string;

  @IsOptional()
  @IsString()
  partNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  unit?: string; // مثلاً: عدد، جفت، کارتن، متر

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  vehicleModelId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  wholesalePrice?: number;

  @IsOptional()
  @IsNumber()
  minStock?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  image?: string;
}
