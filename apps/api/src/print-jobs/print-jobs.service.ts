import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LabelsService } from '../labels/labels.service';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class PrintJobsService {
  constructor(
    private prisma: PrismaService,
    private labelsService: LabelsService,
  ) {}

  async getJobs() {
    return this.prisma.printJob.findMany({
      include: {
        items: {
          include: {
            location: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }


  async runJob(jobId: string) {

    const job = await this.prisma.printJob.findUnique({
      where: {
        id: jobId,
      },
      include: {
        items: {
          include: {
            location: true,
          },
        },
      },
    });


    if (!job) {
      throw new Error('Print job not found');
    }


    const jobFolder = join(
      process.cwd(),
      'storage',
      'labels',
      'jobs',
      job.id,
    );


    if (!existsSync(jobFolder)) {
      mkdirSync(jobFolder, {
        recursive: true,
      });
    }


    await this.prisma.printJob.update({
      where:{
        id:jobId,
      },
      data:{
        status:'PROCESSING',
      },
    });


    let printed = 0;


    for (const item of job.items) {

      if (!item.location) {
        continue;
      }


      try {

        const png =
          await this.labelsService.locationLabelPng(
            item.location.id,
          );


        const filename =
          `${String(printed + 1).padStart(4,'0')}-${item.location.code}.png`;


        const filepath =
          join(
            jobFolder,
            filename,
          );


        writeFileSync(
          filepath,
          png,
        );


        await this.prisma.printJobItem.update({
          where:{
            id:item.id,
          },
          data:{
            status:'PRINTED',
          },
        });


        printed++;


        await this.prisma.printJob.update({
          where:{
            id:jobId,
          },
          data:{
            printedItems:printed,
          },
        });


      } catch(error) {


        await this.prisma.printJobItem.update({
          where:{
            id:item.id,
          },
          data:{
            status:'FAILED',
          },
        });


      }

    }


    await this.prisma.printJob.update({
      where:{
        id:jobId,
      },
      data:{
        status:'COMPLETED',
      },
    });


    return {
      jobId,
      printed,
      folder:jobFolder,
      status:'COMPLETED',
    };
  }
}
