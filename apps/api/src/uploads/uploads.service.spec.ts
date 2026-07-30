import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from './uploads.service';

/** Minimal valid JPEG header (FF D8 FF) padded to the 12-byte sniff minimum. */
const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

function makeFile(over: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    buffer: jpegMagic,
    size: jpegMagic.length,
    mimetype: 'image/jpeg',
    ...over,
  } as unknown as Express.Multer.File;
}

describe('UploadsService', () => {
  let service: UploadsService;
  const prisma = {
    pendingOperation: { findUnique: jest.fn() },
    asset: { findFirst: jest.fn(), create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UploadsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<UploadsService>(UploadsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadPendingOperationPhoto validation', () => {
    const id = '11111111-1111-4111-8111-111111111111';

    it('rejects a missing file', async () => {
      await expect(
        service.uploadPendingOperationPhoto(id, undefined as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an oversized file', async () => {
      await expect(
        service.uploadPendingOperationPhoto(id, makeFile({ size: 99 * 1024 * 1024 })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a disallowed MIME type', async () => {
      await expect(
        service.uploadPendingOperationPhoto(id, makeFile({ mimetype: 'image/gif' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a JPEG MIME whose magic bytes are not an image', async () => {
      await expect(
        service.uploadPendingOperationPhoto(
          id,
          makeFile({ buffer: Buffer.alloc(12) }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the pending operation does not exist (not yet synced)', async () => {
      prisma.pendingOperation.findUnique.mockResolvedValue(null);
      await expect(
        service.uploadPendingOperationPhoto(id, makeFile()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.asset.create).not.toHaveBeenCalled();
    });
  });
});
