import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ImageSearchService } from './image-search.service';
import { ImageDownloadService } from './image-download.service';
import { ImageProcessService } from './image-process.service';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';

const STAGING_BASE = 'storage/staging/product-images';
const FINAL_BASE = 'storage/products';

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);

  /** Re-entrancy guard so overlapping Cron ticks don't process a job twice. */
  private queueRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: ImageSearchService,
    private readonly downloadService: ImageDownloadService,
    private readonly processService: ImageProcessService,
  ) {
    // Ensure staging directory exists
    const stagingPath = join(process.cwd(), STAGING_BASE);
    if (!existsSync(stagingPath)) {
      mkdirSync(stagingPath, { recursive: true });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Product identification — find products without images
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Find products that don't have any PRODUCT_IMAGE asset.
   */
  async findProductsWithoutImages(options: {
    limit?: number;
    offset?: number;
    brandId?: string;
  }) {
    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;

    // Find products that have no PRODUCT_IMAGE asset
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(options.brandId ? { brandId: options.brandId } : {}),
        assets: {
          none: {
            type: 'PRODUCT_IMAGE',
          },
        },
      },
      include: {
        brand: true,
        vehicleModel: true,
        category: true,
        barcodes: true,
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const total = await this.prisma.product.count({
      where: {
        deletedAt: null,
        isActive: true,
        ...(options.brandId ? { brandId: options.brandId } : {}),
        assets: {
          none: {
            type: 'PRODUCT_IMAGE',
          },
        },
      },
    });

    return {
      data: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        partNumber: p.partNumber,
        brand: p.brand?.name ?? null,
        vehicleModel: p.vehicleModel?.name ?? null,
        category: p.category?.name ?? null,
        barcodes: p.barcodes.map((b) => b.barcode),
        hasImage: false,
      })),
      meta: { total, limit, offset },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Search pipeline — search, download, process, create candidates
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Run the full image search pipeline for a single product.
   * Creates candidate records and downloads files to staging.
   */
  async searchForProduct(productId: string): Promise<{
    candidatesFound: number;
    candidates: Array<{ id: string; confidenceScore: number; status: string }>;
  }> {
    // 1. Get product with all metadata
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        brand: true,
        vehicleModel: true,
        category: true,
        barcodes: true,
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    // 2. Check if already has an approved candidate
    const existingApproved = await this.prisma.productImageCandidate.findFirst({
      where: { productId, status: 'APPROVED' },
    });
    if (existingApproved) {
      return { candidatesFound: 0, candidates: [] };
    }

    // 3. Build search queries
    const queries = this.searchService.buildQueries({
      name: product.name,
      brand: product.brand?.name,
      partNumber: product.partNumber,
      vehicleModel: product.vehicleModel?.name,
      category: product.category?.name,
    });

    if (queries.length === 0) {
      this.logger.warn(
        `No search queries could be built for product ${productId}`,
      );
      return { candidatesFound: 0, candidates: [] };
    }

    // 4. Search for images using multiple queries
    const allResults = new Map<
      string,
      {
        imageUrl: string;
        sourceUrl: string;
        sourceDomain: string;
        query: string;
      }
    >();

    for (const q of queries) {
      try {
        // Add delay between requests to avoid rate limiting
        if (allResults.size > 0) {
          await this.sleep(1000 + Math.random() * 1000);
        }

        const results = await this.searchService.searchImagesWithFallback(
          q.query,
          8,
        );
        for (const r of results) {
          if (!allResults.has(r.imageUrl)) {
            allResults.set(r.imageUrl, {
              imageUrl: r.imageUrl,
              sourceUrl: r.sourceUrl,
              sourceDomain: r.sourceDomain,
              query: q.query,
            });
          }
        }
      } catch (error) {
        this.logger.error(
          `Search error for query "${q.query}": ${(error as Error).message}`,
        );
      }
    }

    // 5. Create staging directory
    const stagingDir = join(process.cwd(), STAGING_BASE, productId);
    if (!existsSync(stagingDir)) {
      mkdirSync(stagingDir, { recursive: true });
    }

    // 6. Download, validate, and process each candidate
    const candidates: Array<{
      id: string;
      confidenceScore: number;
      status: string;
    }> = [];
    let candidateIndex = 0;

    for (const [, result] of allResults) {
      if (candidateIndex >= 10) break; // Max 10 candidates per product

      try {
        candidateIndex++;

        // Download image
        const downloaded = await this.downloadService.downloadImage(
          result.imageUrl,
        );

        // Check for exact duplicate (SHA-256)
        const existingDuplicate =
          await this.prisma.productImageCandidate.findFirst({
            where: {
              sha256: downloaded.sha256,
              productId: { not: productId },
            },
          });

        // Validate image
        const validation = await this.processService.validateImage(
          downloaded.buffer,
        );
        if (!validation.valid) {
          this.logger.debug(
            `Invalid image from ${result.sourceDomain}: ${validation.error}`,
          );
          continue;
        }

        // Save original to staging
        const localPath = join(STAGING_BASE, productId, downloaded.fileName);
        const absoluteLocalPath = join(process.cwd(), localPath);
        writeFileSync(absoluteLocalPath, downloaded.buffer);

        // Process image (resize, convert to WebP)
        let processedPath: string | null = null;
        let processedWidth: number | undefined;
        let processedHeight: number | undefined;
        let processedSize: number | undefined;
        let backgroundRemoved = false;

        try {
          const processed = await this.processService.processImage(
            downloaded.buffer,
          );
          const processedFileName = `processed-${downloaded.sha256.slice(0, 12)}.webp`;
          const processedLocalPath = join(
            STAGING_BASE,
            productId,
            processedFileName,
          );
          writeFileSync(
            join(process.cwd(), processedLocalPath),
            Buffer.from(processed.product.buffer),
          );
          processedPath = processedLocalPath;
          processedWidth = processed.product.width;
          processedHeight = processed.product.height;
          processedSize = processed.product.size;
          backgroundRemoved = true;
        } catch (error) {
          this.logger.warn(
            `Image processing failed: ${(error as Error).message}`,
          );
        }

        // Compute perceptual hash
        const perceptualHash = await this.processService.computePerceptualHash(
          downloaded.buffer,
        );

        // Compute confidence score
        const { score, level, reason } = this.computeConfidenceScore(
          product,
          result,
          downloaded,
        );

        // Create candidate record
        const candidate = await this.prisma.productImageCandidate.create({
          data: {
            productId,
            sourceUrl: result.imageUrl,
            sourceDomain: result.sourceDomain,
            searchQuery: result.query,
            localPath,
            originalFilename: downloaded.fileName,
            mimeType: downloaded.mimeType,
            originalWidth: downloaded.width,
            originalHeight: downloaded.height,
            originalSize: downloaded.buffer.length,
            processedPath,
            processedWidth,
            processedHeight,
            processedSize,
            backgroundRemoved,
            sha256: downloaded.sha256,
            perceptualHash,
            confidenceScore: score,
            confidenceLevel: level,
            matchReason: reason,
            status: 'PENDING',
          },
        });

        candidates.push({
          id: candidate.id,
          confidenceScore: score,
          status: candidate.status,
        });
      } catch (error) {
        this.logger.error(
          `Candidate processing error: ${(error as Error).message}`,
        );
      }
    }

    return { candidatesFound: candidates.length, candidates };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Search queue — enqueue now, scrape later in the background
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Queue products for image search and return immediately.
   *
   * Scraping is slow (seconds per query, plus deliberate rate-limit delays), so
   * doing it inside the HTTP request timed the request out long before the work
   * finished. The admin panel now gets an instant answer and watches progress
   * through the stats endpoint it already polls.
   *
   * Products that already have a QUEUED/RUNNING job are skipped so double
   * clicking the button doesn't scrape the same product twice.
   */
  async enqueueSearch(options: {
    productIds?: string[];
    limit?: number;
    brandId?: string;
  }): Promise<{ queued: number; alreadyQueued: number }> {
    let productIds = options.productIds ?? [];

    if (!productIds.length) {
      const { data } = await this.findProductsWithoutImages({
        limit: options.limit ?? 20,
        brandId: options.brandId,
      });
      productIds = data.map((p) => p.id);
    }

    if (!productIds.length) return { queued: 0, alreadyQueued: 0 };

    const pending = await this.prisma.imageSearchJob.findMany({
      where: {
        productId: { in: productIds },
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      select: { productId: true },
    });
    const pendingIds = new Set(pending.map((j) => j.productId));
    const toQueue = productIds.filter((id) => !pendingIds.has(id));

    if (toQueue.length) {
      await this.prisma.imageSearchJob.createMany({
        data: toQueue.map((productId) => ({
          productId,
          status: 'QUEUED' as const,
        })),
      });
    }

    return { queued: toQueue.length, alreadyQueued: pendingIds.size };
  }

  /**
   * Drain the search queue in the background.
   *
   * Runs one job at a time on purpose: the scrapers get blocked quickly under
   * parallel load, and there is no deadline on this work. A job that throws is
   * retried until it hits maxAttempts, then parked as FAILED with the error so
   * the panel can show why.
   */
  @Cron('*/30 * * * * *')
  async processSearchQueue(): Promise<void> {
    if (this.queueRunning) return;
    this.queueRunning = true;

    try {
      // Bounded per tick so a huge backlog can't hold the worker forever; the
      // next tick picks up where this one stopped.
      for (let processed = 0; processed < 5; processed++) {
        const job = await this.prisma.imageSearchJob.findFirst({
          where: { status: 'QUEUED' },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        });
        if (!job) break;

        // Claim it, guarding against another instance taking the same row.
        const claimed = await this.prisma.imageSearchJob.updateMany({
          where: { id: job.id, status: 'QUEUED' },
          data: {
            status: 'RUNNING',
            startedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
        if (claimed.count === 0) continue;

        try {
          await this.searchForProduct(job.productId);
          await this.prisma.imageSearchJob.update({
            where: { id: job.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              lastError: null,
            },
          });
        } catch (error) {
          const message = (error as Error).message;
          const current = await this.prisma.imageSearchJob.findUnique({
            where: { id: job.id },
            select: { attempts: true, maxAttempts: true },
          });
          const exhausted =
            (current?.attempts ?? 0) >= (current?.maxAttempts ?? 3);

          await this.prisma.imageSearchJob.update({
            where: { id: job.id },
            data: {
              // Not exhausted yet → back to QUEUED for another attempt later.
              status: exhausted ? 'FAILED' : 'QUEUED',
              lastError: message,
              ...(exhausted ? { completedAt: new Date() } : {}),
            },
          });
          this.logger.error(
            `Image search job ${job.id} failed (attempt ${current?.attempts}): ${message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Search queue tick failed: ${(error as Error).message}`,
      );
    } finally {
      this.queueRunning = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Confidence scoring
  // ═══════════════════════════════════════════════════════════════════════

  private computeConfidenceScore(
    product: {
      name: string;
      partNumber: string | null;
      brand?: { name: string } | null;
      sku: string;
    },
    result: { sourceDomain: string; sourceUrl: string; query: string },
    downloaded: {
      sha256: string;
      buffer: Buffer;
      width?: number;
      height?: number;
    },
  ): {
    score: number;
    level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    reason: string;
  } {
    let score = 0;
    const reasons: string[] = [];

    // Part Number in source URL or domain: +40
    if (product.partNumber && result.sourceUrl.includes(product.partNumber)) {
      score += 40;
      reasons.push('Part Number in URL +40');
    } else if (
      product.partNumber &&
      result.sourceDomain.includes(product.partNumber)
    ) {
      score += 40;
      reasons.push('Part Number in domain +40');
    }

    // Brand in source domain: +15
    if (
      product.brand?.name &&
      result.sourceDomain
        .toLowerCase()
        .includes(product.brand.name.toLowerCase())
    ) {
      score += 15;
      reasons.push('Brand in domain +15');
    }

    // Brand in search query: +10
    if (
      product.brand?.name &&
      result.query.toLowerCase().includes(product.brand.name.toLowerCase())
    ) {
      score += 10;
      reasons.push('Brand in query +10');
    }

    // Part Number in search query: +20
    if (product.partNumber && result.query.includes(product.partNumber)) {
      score += 20;
      reasons.push('Part Number in query +20');
    }

    // Image quality (resolution): +5
    if (downloaded.width && downloaded.height) {
      if (downloaded.width >= 400 && downloaded.height >= 400) {
        score += 5;
        reasons.push('Good resolution +5');
      } else if (downloaded.width < 200 || downloaded.height < 200) {
        score -= 10;
        reasons.push('Low resolution -10');
      }
    }

    // Known good sources: +5
    const trustedDomains = [
      'bosch',
      'denso',
      'ngk',
      'mann-filter',
      'mahle',
      'febi',
      'skf',
      'tnl',
      'luk',
    ];
    if (
      trustedDomains.some((d) => result.sourceDomain.toLowerCase().includes(d))
    ) {
      score += 5;
      reasons.push('Trusted source +5');
    }

    // Negative signals
    if (
      result.sourceDomain.includes('amazon') ||
      result.sourceDomain.includes('ebay')
    ) {
      score -= 5;
      reasons.push('Marketplace source -5');
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    let level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    if (score >= 90) level = 'HIGH';
    else if (score >= 75) level = 'MEDIUM';
    else if (score >= 50) level = 'LOW';
    else level = 'NONE';

    return { score, level, reason: reasons.join('; ') };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Review & Publish
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Approve a candidate image — atomically move to final storage and create Asset.
   */
  async approveCandidate(
    candidateId: string,
    userId: string,
  ): Promise<{ assetId: string }> {
    const candidate = await this.prisma.productImageCandidate.findUnique({
      where: { id: candidateId },
      include: { product: true },
    });

    if (!candidate) throw new NotFoundException('Candidate not found');
    if (candidate.status === 'APPROVED')
      throw new BadRequestException('Already approved');

    // Read the processed image from staging
    const processedPath = candidate.processedPath;
    if (!processedPath)
      throw new BadRequestException('No processed image available');

    const absoluteProcessedPath = join(process.cwd(), processedPath);
    if (!existsSync(absoluteProcessedPath)) {
      throw new BadRequestException('Processed file not found on disk');
    }

    const imageBuffer = readFileSync(absoluteProcessedPath);

    // Create final storage path
    const base = `${candidate.productId}-${Date.now()}-${candidate.sha256?.slice(0, 8) ?? 'img'}`;
    const finalDir = join(process.cwd(), FINAL_BASE);
    if (!existsSync(finalDir)) mkdirSync(finalDir, { recursive: true });

    const mainFileName = `${base}.webp`;
    const thumbFileName = `${base}.thumb.webp`;

    // Generate thumbnail from the processed image
    let thumbBuffer: Buffer = Buffer.from(imageBuffer);
    try {
      const sharp = (await import('sharp')).default;
      const thumb = await sharp(imageBuffer)
        .resize({
          width: 300,
          height: 300,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 75 })
        .toBuffer();
      thumbBuffer = Buffer.from(thumb);
    } catch {
      // Use the same image as thumbnail if processing fails
    }

    // Write final files first, then commit the DB changes. If the transaction
    // fails we delete these files again (below) so final storage never keeps an
    // image that has no Asset row — i.e. publish is all-or-nothing.
    writeFileSync(join(finalDir, mainFileName), imageBuffer);
    writeFileSync(join(finalDir, thumbFileName), thumbBuffer);

    let asset: { id: string };
    try {
      // Atomic database update: create Asset + update candidate status + audit log
      asset = await this.prisma.$transaction(async (tx) => {
        // Create the Asset record
        const created = await tx.asset.create({
          data: {
            path: `/storage/products/${mainFileName}`,
            thumbnailPath: `/storage/products/${thumbFileName}`,
            fileName: mainFileName,
            type: 'PRODUCT_IMAGE',
            productId: candidate.productId,
            mimeType: 'image/webp',
            bytes: imageBuffer.length,
            width: candidate.processedWidth,
            height: candidate.processedHeight,
            sha256: candidate.sha256,
          },
        });

        // Update candidate status
        await tx.productImageCandidate.update({
          where: { id: candidateId },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewedById: userId,
          },
        });

        // Audit log
        await tx.imagePublishLog.create({
          data: {
            productId: candidate.productId,
            candidateId,
            action: 'IMAGE_APPROVED',
            userId,
            details: {
              assetId: created.id,
              confidenceScore: candidate.confidenceScore,
              sourceDomain: candidate.sourceDomain,
            },
          },
        });

        return created;
      });
    } catch (err) {
      // Compensating cleanup: the commit failed, so roll back the files we just
      // wrote to final storage. Leaving them would create an orphaned image.
      try {
        unlinkSync(join(finalDir, mainFileName));
      } catch {
        /* best effort */
      }
      try {
        unlinkSync(join(finalDir, thumbFileName));
      } catch {
        /* best effort */
      }
      throw err;
    }

    // Archive staging files (delete after successful publish)
    try {
      unlinkSync(absoluteProcessedPath);
      const originalPath = join(process.cwd(), candidate.localPath ?? '');
      if (existsSync(originalPath)) unlinkSync(originalPath);
    } catch {
      // Best effort cleanup
    }

    return { assetId: asset.id };
  }

  /**
   * Reject a candidate image.
   */
  async rejectCandidate(
    candidateId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const candidate = await this.prisma.productImageCandidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) throw new NotFoundException('Candidate not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.productImageCandidate.update({
        where: { id: candidateId },
        data: {
          status: 'REJECTED',
          rejectReason: reason,
          reviewedAt: new Date(),
          reviewedById: userId,
        },
      });

      await tx.imagePublishLog.create({
        data: {
          productId: candidate.productId,
          candidateId,
          action: 'IMAGE_REJECTED',
          userId,
          details: { reason },
        },
      });
    });

    // Cleanup staging files
    try {
      if (candidate.localPath) {
        const p = join(process.cwd(), candidate.localPath);
        if (existsSync(p)) unlinkSync(p);
      }
      if (candidate.processedPath) {
        const p = join(process.cwd(), candidate.processedPath);
        if (existsSync(p)) unlinkSync(p);
      }
    } catch {
      // Best effort
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Bulk operations
  // ═══════════════════════════════════════════════════════════════════════

  async bulkApprove(candidateIds: string[], userId: string) {
    // Only HIGH confidence candidates can be bulk-approved
    const candidates = await this.prisma.productImageCandidate.findMany({
      where: { id: { in: candidateIds } },
    });

    const eligible = candidates.filter(
      (c) =>
        c.confidenceLevel === 'HIGH' &&
        c.status === 'PENDING' &&
        c.processedPath,
    );
    const skipped = candidateIds.length - eligible.length;

    const results: Array<{
      candidateId: string;
      success: boolean;
      assetId?: string;
      error?: string;
    }> = [];

    for (const c of eligible) {
      try {
        const { assetId } = await this.approveCandidate(c.id, userId);
        results.push({ candidateId: c.id, success: true, assetId });
      } catch (error) {
        results.push({
          candidateId: c.id,
          success: false,
          error: (error as Error).message,
        });
      }
    }

    return {
      approved: results.filter((r) => r.success).length,
      skipped,
      results,
    };
  }

  async bulkReject(candidateIds: string[], userId: string, reason?: string) {
    let rejected = 0;
    for (const id of candidateIds) {
      try {
        await this.rejectCandidate(id, userId, reason);
        rejected++;
      } catch {
        // Skip failures
      }
    }
    return { rejected };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Stats
  // ═══════════════════════════════════════════════════════════════════════

  async getStats() {
    const [
      totalProducts,
      productsWithoutImages,
      candidatesByStatus,
      candidatesByConfidence,
      searchJobsByStatus,
    ] = await Promise.all([
      this.prisma.product.count({ where: { deletedAt: null, isActive: true } }),

      this.prisma.product.count({
        where: {
          deletedAt: null,
          isActive: true,
          assets: { none: { type: 'PRODUCT_IMAGE' } },
        },
      }),

      this.prisma.productImageCandidate.groupBy({
        by: ['status'],
        _count: { id: true },
      }),

      this.prisma.productImageCandidate.groupBy({
        by: ['confidenceLevel'],
        _count: { id: true },
      }),

      this.prisma.imageSearchJob.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      candidatesByStatus.map((r) => [r.status, r._count.id]),
    );
    const confidenceCounts = Object.fromEntries(
      candidatesByConfidence.map((r) => [r.confidenceLevel, r._count.id]),
    );
    const jobCounts = Object.fromEntries(
      searchJobsByStatus.map((r) => [r.status, r._count.id]),
    );

    return {
      totalProducts,
      productsWithoutImages,
      searchQueued: jobCounts['QUEUED'] ?? 0,
      searchRunning: jobCounts['RUNNING'] ?? 0,
      searchCompleted: jobCounts['COMPLETED'] ?? 0,
      searchFailed: jobCounts['FAILED'] ?? 0,
      candidatesPending: statusCounts['PENDING'] ?? 0,
      candidatesProcessing: statusCounts['PROCESSING'] ?? 0,
      candidatesApproved: statusCounts['APPROVED'] ?? 0,
      candidatesRejected: statusCounts['REJECTED'] ?? 0,
      candidatesFailed: statusCounts['FAILED'] ?? 0,
      highConfidence: confidenceCounts['HIGH'] ?? 0,
      mediumConfidence: confidenceCounts['MEDIUM'] ?? 0,
      lowConfidence: confidenceCounts['LOW'] ?? 0,
      noConfidence: confidenceCounts['NONE'] ?? 0,
      progress:
        totalProducts > 0
          ? Math.round(
              ((totalProducts - productsWithoutImages) / totalProducts) * 100,
            )
          : 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // List candidates with filters
  // ═══════════════════════════════════════════════════════════════════════

  async listCandidates(filters: {
    page?: number;
    limit?: number;
    filter?: string;
    brandId?: string;
    categoryId?: string;
    search?: string;
    productId?: string;
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Status filter
    if (filters.filter && filters.filter !== 'ALL') {
      switch (filters.filter) {
        case 'PENDING':
          where.status = 'PENDING';
          break;
        case 'APPROVED':
          where.status = 'APPROVED';
          break;
        case 'REJECTED':
          where.status = 'REJECTED';
          break;
        case 'FAILED':
          where.status = 'FAILED';
          break;
        case 'HIGH_CONFIDENCE':
          where.confidenceLevel = 'HIGH';
          break;
        case 'MEDIUM_CONFIDENCE':
          where.confidenceLevel = 'MEDIUM';
          break;
        case 'LOW_CONFIDENCE':
          where.confidenceLevel = 'LOW';
          break;
        case 'NO_IMAGE_FOUND':
          // Products with no candidates at all
          where.candidates = { none: {} };
          break;
      }
    }

    // Brand filter
    if (filters.brandId) {
      where.product = { ...where.product, brandId: filters.brandId };
    }

    // Category filter
    if (filters.categoryId) {
      where.product = { ...where.product, categoryId: filters.categoryId };
    }

    // Product ID filter
    if (filters.productId) {
      where.productId = filters.productId;
    }

    // Search filter (on product name, part number, SKU)
    if (filters.search) {
      where.product = {
        ...where.product,
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { partNumber: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.productImageCandidate.findMany({
        where,
        include: {
          product: {
            include: {
              brand: true,
              vehicleModel: true,
              category: true,
            },
          },
          reviewedBy: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.productImageCandidate.count({ where }),
    ]);

    return {
      data: data.map((c) => ({
        id: c.id,
        status: c.status,
        confidenceScore: c.confidenceScore,
        confidenceLevel: c.confidenceLevel,
        matchReason: c.matchReason,
        sourceUrl: c.sourceUrl,
        sourceDomain: c.sourceDomain,
        searchQuery: c.searchQuery,
        localPath: c.localPath,
        processedPath: c.processedPath,
        originalWidth: c.originalWidth,
        originalHeight: c.originalHeight,
        originalSize: c.originalSize,
        processedWidth: c.processedWidth,
        processedHeight: c.processedHeight,
        processedSize: c.processedSize,
        backgroundRemoved: c.backgroundRemoved,
        rejectReason: c.rejectReason,
        createdAt: c.createdAt,
        reviewedAt: c.reviewedAt,
        reviewedBy: c.reviewedBy?.fullName ?? null,
        product: {
          id: c.product.id,
          name: c.product.name,
          sku: c.product.sku,
          partNumber: c.product.partNumber,
          brand: c.product.brand?.name ?? null,
          vehicleModel: c.product.vehicleModel?.name ?? null,
          category: c.product.category?.name ?? null,
        },
      })),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Get a single candidate with full details.
   */
  async getCandidate(id: string) {
    const candidate = await this.prisma.productImageCandidate.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            brand: true,
            vehicleModel: true,
            category: true,
            barcodes: true,
            assets: { where: { type: 'PRODUCT_IMAGE' } },
          },
        },
        reviewedBy: {
          select: { id: true, fullName: true },
        },
        replaces: {
          select: { id: true, status: true, confidenceScore: true },
        },
      },
    });

    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
