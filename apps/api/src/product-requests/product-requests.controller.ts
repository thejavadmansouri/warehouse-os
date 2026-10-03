import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { ProductRequestsService } from './product-requests.service';
import {
  ApproveProductRequestDto,
  CreateProductRequestDto,
  RejectProductRequestDto,
} from './dto/product-request.dto';

@Controller('product-requests')
export class ProductRequestsController {
  constructor(private readonly service: ProductRequestsService) {}

  // Worker submits a new-product request.
  @Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
  @Post()
  create(@Body() dto: CreateProductRequestDto, @Req() req: any) {
    return this.service.create(dto, req.user?.userId);
  }

  // A worker sees their own requests (status / rejection reason).
  @Roles(Role.STAFF, Role.MANAGER, Role.ADMIN)
  @Get('mine')
  mine(@Req() req: any) {
    return this.service.listMine(req.user?.userId);
  }

  // Manager review list (optionally filtered by status/warehouse).
  @Roles(Role.MANAGER, Role.ADMIN)
  @Get()
  list(
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.list(status, warehouseId);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Post(':id/approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApproveProductRequestDto,
    @Req() req: any,
  ) {
    return this.service.approve(id, req.user?.userId, dto);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Post(':id/reject')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectProductRequestDto,
    @Req() req: any,
  ) {
    return this.service.reject(id, req.user?.userId, dto?.reviewNote);
  }
}
