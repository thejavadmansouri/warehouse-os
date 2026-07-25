import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';


@Injectable()
export class UploadsService {


  private productPath = join(
    process.cwd(),
    'storage',
    'products'
  );


  private inventoryLogPath = join(
    process.cwd(),
    'storage',
    'inventory-logs'
  );



  constructor(
    private prisma: PrismaService
  ){

    if(!existsSync(this.productPath)){
      mkdirSync(this.productPath,{
        recursive:true
      });
    }


    if(!existsSync(this.inventoryLogPath)){
      mkdirSync(this.inventoryLogPath,{
        recursive:true
      });
    }

  }




  async uploadProductImage(
    productId:string,
    file:Express.Multer.File
  ){

    const filename =
      `${productId}-${Date.now()}.jpg`;


    const filepath =
      join(
        this.productPath,
        filename
      );


    writeFileSync(
      filepath,
      file.buffer
    );


    const image =
      `/storage/products/${filename}`;


    return this.prisma.asset.create({

      data:{

        path:image,

        type:'PRODUCT_IMAGE',

        productId

      }

    });

  }






  async uploadInventoryLogImage(
    logId:string,
    file:Express.Multer.File
  ){

    const filename =
      `${logId}-${Date.now()}.jpg`;


    const filepath =
      join(
        this.inventoryLogPath,
        filename
      );


    writeFileSync(
      filepath,
      file.buffer
    );


    const image =
      `/storage/inventory-logs/${filename}`;


    return this.prisma.asset.create({

      data:{

        path:image,

        type:'INVENTORY_IMAGE',

        inventoryLogId:logId

      }

    });

  }


}
