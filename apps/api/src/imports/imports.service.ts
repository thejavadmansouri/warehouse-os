import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportRowStatus } from '@prisma/client';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import * as XLSX from 'xlsx';
import { StringMatcher } from './utils/string-matcher.util';

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  private parsePrice(value: any): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }

  private parseQuantity(value: any): number {
    if (value === undefined || value === null || value === '') return 0;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  async parseAndPreview(file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('فایلی برای آپلود دریافت نشد.');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('شیت معتبری در فایل اکسل یافت نشد.');
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (rawRows.length === 0) {
      throw new BadRequestException('فایل اکسل خالی است.');
    }

    const [brands, catalogs, vehicles] = await Promise.all([
      this.prisma.brand.findMany(),
      this.prisma.partCatalog.findMany(),
      this.prisma.vehicleModel.findMany(),
    ]);

    const importJob = await this.prisma.importJob.create({
      data: { fileName: file.originalname },
    });

    const rowsToCreate: any[] = [];
    const previewResult: any[] = [];

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];

      const productName = String(row['productName'] || row['نام قطعه'] || '').trim();
      const brandName = String(row['brand'] || row['برند'] || '').trim();
      const vehicleName = String(row['vehicleModel'] || row['خودرو'] || '').trim();
      const partNumber = row['partNumber'] || row['شماره فنی'] ? String(row['partNumber'] || row['شماره فنی']).trim() : null;
      const unit = String(row['unit'] || row['واحد'] || 'عدد').trim();

      const purchasePrice = this.parsePrice(row['purchasePrice'] ?? row['قیمت خرید']);
      const salePrice = this.parsePrice(row['salePrice'] ?? row['قیمت فروش']);
      const wholesalePrice = this.parsePrice(row['wholesalePrice'] ?? row['قیمت عمده']);
      const quantity = this.parseQuantity(row['quantity'] ?? row['تعداد']);

      const matchedBrand = brands.find((b) =>
        StringMatcher.matches(brandName, b.name, b.aliases),
      );

      const matchedCatalog = catalogs.find((c) =>
        StringMatcher.matches(productName, c.name, c.aliases),
      );

      const matchedVehicle = vehicles.find((v) =>
        StringMatcher.matches(vehicleName, v.name, v.aliases),
      );

      let status: ImportRowStatus = ImportRowStatus.READY;
      if (brandName && !matchedBrand) {
        status = ImportRowStatus.NEW_BRAND;
      } else if (productName && !matchedCatalog) {
        status = ImportRowStatus.NEW_PART;
      } else if (vehicleName && !matchedVehicle) {
        status = ImportRowStatus.NEW_VEHICLE;
      }

      rowsToCreate.push({
        importJobId: importJob.id,
        rowNumber: index + 1,
        productName: productName || 'بدون نام',
        brandName: brandName || null,
        vehicleModelName: vehicleName || null,
        partNumber: partNumber || null,
        unit: unit || 'عدد',
        purchasePrice: purchasePrice !== null ? purchasePrice : 0,
        salePrice: salePrice !== null ? salePrice : 0,
        wholesalePrice: wholesalePrice !== null ? wholesalePrice : 0,
        quantity,
        matchedBrandId: matchedBrand?.id || null,
        matchedCatalogId: matchedCatalog?.id || null,
        matchedVehicleId: matchedVehicle?.id || null,
        status: status as ImportRowStatus,
      });

      previewResult.push({
        row: index + 1,
        productName,
        brand: brandName,
        matchedBrand: !!matchedBrand,
        partCatalog: matchedCatalog ? matchedCatalog.name : productName,
        matchedPart: !!matchedCatalog,
        vehicle: vehicleName,
        matchedVehicle: !!matchedVehicle,
        status,
      });
    }

    await this.prisma.importRow.createMany({
      data: rowsToCreate,
    });

    return {
      importId: importJob.id,
      totalRows: previewResult.length,
      preview: previewResult,
    };
  }

  async confirmImport(importId: string, dto: ConfirmImportDto) {
    const job = await this.prisma.importJob.findUnique({
      where: { id: importId },
      include: { rows: true },
    });

    if (!job) {
      throw new NotFoundException('شناسه ایمپورت یافت نشد.');
    }

    return await this.prisma.$transaction(async (tx) => {
      let createdProductsCount = 0;

      for (const row of job.rows) {
        if (row.status === ImportRowStatus.COMPLETED) {
          continue;
        }

        let brandId = row.matchedBrandId;
        let catalogId = row.matchedCatalogId;
        let vehicleId = row.matchedVehicleId;

        if (!brandId && row.brandName) {
          const existingBrand = await tx.brand.findUnique({
            where: { name: row.brandName },
          });

          if (existingBrand) {
            brandId = existingBrand.id;
          } else {
            const newBrand = await tx.brand.create({
              data: {
                name: row.brandName,
                aliases: [row.brandName],
              },
            });
            brandId = newBrand.id;
          }
        }

        if (!catalogId && row.productName) {
          const existingCatalog = await tx.partCatalog.findUnique({
            where: { name: row.productName },
          });

          if (existingCatalog) {
            catalogId = existingCatalog.id;
          } else {
            const newCatalog = await tx.partCatalog.create({
              data: {
                name: row.productName ?? 'بدون نام',
                unit: row.unit || 'عدد',
                aliases: [row.productName ?? 'بدون نام'],
              },
            });
            catalogId = newCatalog.id;
          }
        }

        if (!vehicleId && row.vehicleModelName) {
          const existingVehicle = await tx.vehicleModel.findFirst({
            where: { name: row.vehicleModelName },
          });

          if (existingVehicle) {
            vehicleId = existingVehicle.id;
          } else {
            const newVehicle = await tx.vehicleModel.create({
              data: {
                name: row.vehicleModelName,
                startYear: 1300,
                endYear: 1405,
                aliases: [row.vehicleModelName],
              },
            });
            vehicleId = newVehicle.id;
          }
        }

        const generatedSku = `SKU-${Date.now()}-${row.rowNumber}`;

        await tx.product.create({
          data: {
            name: row.productName ?? 'بدون نام',
            sku: generatedSku,
            partNumber: row.partNumber,
            unit: row.unit || 'عدد',
            partCatalogId: catalogId,
            brandId: brandId,
            vehicleModelId: vehicleId,
            prices: {
              create: {
                purchasePrice: row.purchasePrice,
                salePrice: row.salePrice,
                wholesalePrice: row.wholesalePrice,
              },
            },
          },
        });

        await tx.importRow.update({
          where: { id: row.id },
          data: { status: ImportRowStatus.COMPLETED },
        });

        createdProductsCount++;
      }

      return {
        success: true,
        message: 'عملیات ایمپورت با موفقیت تایید و اعمال شد.',
        createdProducts: createdProductsCount,
      };
    });
  }
}
