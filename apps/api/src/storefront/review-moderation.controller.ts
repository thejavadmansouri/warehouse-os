import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { SiteAccessGuard } from '../auth/site-access.guard';
import { ReviewModerationService } from './review-moderation.service';

/**
 * صفِ تأیید نظرات در پنلِ سایت — عمومی نیست: `JwtAuthGuard` سراسری +
 * `SiteAccessGuard`. هیچ‌وقت `@Public()` نگیرد.
 */
@UseGuards(SiteAccessGuard)
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
