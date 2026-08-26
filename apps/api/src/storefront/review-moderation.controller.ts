import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Role } from '@prisma/client';

import { Roles } from '../auth/roles.decorator';
import { ReviewModerationService } from './review-moderation.service';

/**
 * صفِ تأیید نظرات در پنلِ سایت — عمومی نیست: `JwtAuthGuard` سراسری + `@Roles`.
 * هیچ‌وقت `@Public()` نگیرد.
 */
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('review-moderation')
export class ReviewModerationController {
  constructor(private readonly reviews: ReviewModerationService) {}

  @Get('pending')
  pending() {
    return this.reviews.listPending();
  }

  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.reject(id);
  }
}
