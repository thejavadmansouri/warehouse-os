import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { ProductImagesService } from './product-images.service';
import { BulkActionDto, RejectDto, StartSearchDto } from './dto/query.dto';
import type { Request, Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';

@Controller('admin/product-images')
@Roles(Role.ADMIN, Role.MANAGER)
export class ProductImagesController {
  constructor(private readonly service: ProductImagesService) {}

  /**
   * GET /admin/product-images
   * List candidates with filters, pagination, and product info.
   */
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
    @Query('brandId') brandId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('productId') productId?: string,
  ) {
    return this.service.listCandidates({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      filter,
      brandId,
      categoryId,
      search,
      productId,
    });
  }

  /**
   * GET /admin/product-images/stats
   * Progress dashboard stats.
   */
  @Get('stats')
  async stats() {
    return this.service.getStats();
  }

  /**
   * GET /admin/product-images/without-images
   * Products that don't have any image.
   */
  @Get('without-images')
  async withoutImages(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('brandId') brandId?: string,
  ) {
    return this.service.findProductsWithoutImages({
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      brandId,
    });
  }

  /**
   * GET /admin/product-images/:id
   * Get single candidate with full details.
   */
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.service.getCandidate(id);
  }

  /**
   * POST /admin/product-images/:id/approve
   * Approve a candidate — atomically publish to final storage.
   */
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as any).user?.id;
    return this.service.approveCandidate(id, userId);
  }

  /**
   * POST /admin/product-images/:id/reject
   * Reject a candidate.
   */
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: RejectDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.id;
    await this.service.rejectCandidate(id, userId, body.reason);
    return { success: true };
  }

  /**
   * POST /admin/product-images/:id/search-again
   * Queue another search for this candidate's product.
   */
  @Post(':id/search-again')
  async searchAgain(@Param('id') id: string) {
    const candidate = await this.service.getCandidate(id);
    return this.service.enqueueSearch({ productIds: [candidate.productId] });
  }

  /**
   * POST /admin/product-images/search
   * Queue an image search for products and return immediately. The background
   * worker drains the queue; progress shows up in /stats.
   */
  @Post('search')
  async startSearch(@Body() body: StartSearchDto) {
    return this.service.enqueueSearch({
      productIds: body.productIds,
      limit: body.limit,
      brandId: body.brandId,
    });
  }

  /**
   * POST /admin/product-images/bulk-approve
   * Bulk approve HIGH confidence candidates only.
   */
  @Post('bulk-approve')
  async bulkApprove(@Body() body: BulkActionDto, @Req() req: Request) {
    const userId = (req as any).user?.id;
    return this.service.bulkApprove(body.candidateIds, userId);
  }

  /**
   * POST /admin/product-images/bulk-reject
   * Bulk reject candidates.
   */
  @Post('bulk-reject')
  async bulkReject(
    @Body() body: BulkActionDto & { reason?: string },
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.id;
    return this.service.bulkReject(body.candidateIds, userId, body.reason);
  }

  /**
   * GET /admin/product-images/file/:path*
   * Serve staging image files with auth protection.
   * The :path* param captures the relative path after "file/".
   */
  @Get('file/*')
  async serveFile(
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    // Extract the path after /admin/product-images/file/
    const fullPath = (req.params as any)[0] as string;
    if (!fullPath) throw new NotFoundException('File not found');

    // Security: prevent path traversal
    const normalized = fullPath.replace(/\.\./g, '').replace(/^\/+/, '');
    const absolute = join(process.cwd(), normalized);

    // Only allow serving from storage/staging or storage/products
    if (
      !absolute.includes('storage/staging') &&
      !absolute.includes('storage/products')
    ) {
      throw new NotFoundException('File not found');
    }

    if (!existsSync(absolute)) {
      throw new NotFoundException('File not found');
    }

    // Determine MIME type from extension
    const ext = absolute.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    const mimeType = mimeMap[ext] ?? 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return createReadStream(absolute);
  }
}
