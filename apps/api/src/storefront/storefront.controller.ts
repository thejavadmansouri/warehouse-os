import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../auth/decorators/public.decorator';
import { CurrentCustomer, CustomerAuthGuard } from './customer-token';
// `import type` لازم است: با isolatedModules + emitDecoratorMetadata، تایپی که
// در امضای یک متدِ دکوره‌شده می‌آید نباید به‌صورت مقدار import شود.
import type { CustomerPrincipal } from './customer-token';
import { StorefrontCatalogService } from './storefront-catalog.service';
import { StorefrontAuthService } from './storefront-auth.service';
import { StorefrontOrderService } from './storefront-order.service';
import { StorefrontFavoritesService } from './storefront-favorites.service';
import { StorefrontReviewsService } from './storefront-reviews.service';
import { StorefrontStockNotifyService } from './storefront-stock-notify.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { NotifyStockDto } from './dto/notify-stock.dto';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { PreviewCouponDto } from './dto/preview-coupon.dto';

/**
 * تنها دروازه‌ی عمومی کل API.
 *
 * `@Public()` روی کلاس یعنی `JwtAuthGuard` سراسری اینجا کنار می‌رود؛ هیچ `@Roles`
 * هم نیست پس `RolesGuard` هم رد می‌شود. مسیرهایی که مشتریِ واردشده لازم دارند،
 * جداگانه `CustomerAuthGuard` می‌خورند — توکنِ مشتری، نه توکنِ کارکنان.
 *
 * ⚠️ هر متدی که اینجا اضافه می‌شود روی اینترنت باز است. پیش از افزودن، این را
 * بپرس: «اگر رقیب این را هر ثانیه صدا بزند چه چیزی از مغازه لو می‌رود؟»
 */
@Public()
@Controller('shop')
export class StorefrontController {
  constructor(
    private readonly catalog: StorefrontCatalogService,
    private readonly auth: StorefrontAuthService,
    private readonly orders: StorefrontOrderService,
    private readonly favorites: StorefrontFavoritesService,
    private readonly reviews: StorefrontReviewsService,
    private readonly stockNotify: StorefrontStockNotifyService,
  ) {}

  // ─────────── کاتالوگ (بدون ورود) ───────────

  /** مشخصات مغازه، واحد پول، هزینه‌ی ارسال — چیزی که سایت برای بوت لازم دارد. */
  @Get('settings')
  settings() {
    return this.catalog.settings();
  }

  @Get('products')
  list(@Query() query: CatalogQueryDto) {
    return this.catalog.list({
      ...query,
      // از query string رشته می‌آید؛ سرویس boolean می‌خواهد.
      inStock: query.inStock === 'true',
    });
  }

  /**
   * فهرستِ ایمنِ چند کالا با id — برای سبد و علاقه‌مندی، در یک درخواست.
   *
   * باید **قبل** از `products/:id` ثبت شود، وگرنه مسیرِ `by-ids` را `:id` می‌گیرد
   * و ValidationPipe آن را UUID نمی‌یابد. پارامترِ `ids` ویرگول‌جداکن حداکثرِ
   * ۱۰۰ شناسه است؛ پاسخ فقط کالاهای قابل‌نمایش/قیمت‌دار را برمی‌گرداند (همان
   * `listByIds`) و شناسه‌ی ناشناخته/آفلاین خودبه‌خود می‌افتد.
   */
  @Get('products/by-ids')
  byIds(@Query('ids') ids?: string) {
    const parsed = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);
    return this.catalog.listByIds(parsed);
  }

  @Get('products/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.detail(id);
  }

  @Get('products/:id/related')
  related(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.related(id);
  }

  /** نظرهای تأییدشده + میانگین امتیاز (عمومی). */
  @Get('products/:id/reviews')
  productReviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.forProduct(id);
  }

  /** «موجود شد خبرم کن» — بدون ورود، فقط شماره. سخت‌گیرانه محدود می‌شود. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('products/:id/notify')
  notifyStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotifyStockDto,
  ) {
    return this.stockNotify.subscribe(id, dto.phone);
  }

  /** دسته‌ها و برندهای موجود، برای نوار فیلتر. */
  @Get('facets')
  facets() {
    return this.catalog.facets();
  }

  /** بنرهای فعالِ صفحه‌ی اول. */
  @Get('banners')
  banners() {
    return this.catalog.banners();
  }

  /** مناطقِ ارسال (خالی یعنی نرخِ ثابتِ فروشگاه). */
  @Get('shipping-zones')
  shippingZones() {
    return this.catalog.shippingZones();
  }

  // ─────────── ورود با کد پیامکی ───────────

  /**
   * سخت‌گیرانه محدود می‌شود: هر پیامک هزینه دارد و بدون این سقف، یک اسکریپت
   * می‌تواند هم اعتبار پیامکِ مغازه را بسوزاند و هم شماره‌ی یک نفر را بمباران کند.
   * سرویس جداگانه فاصله‌ی بین دو کد را هم اعمال می‌کند.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/otp')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  // حدسِ کدِ چهاررقمی باید گران باشد؛ شمارنده‌ی تلاش در سرویس هم هست.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.name);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('me')
  me(@CurrentCustomer() me: CustomerPrincipal) {
    return this.auth.me(me.customerId);
  }

  // ─────────── سفارش (نیازمند ورود) ───────────

  @UseGuards(CustomerAuthGuard)
  @Post('orders')
  createOrder(
    @CurrentCustomer() me: CustomerPrincipal,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.create(me.customerId, dto);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('orders')
  myOrders(@CurrentCustomer() me: CustomerPrincipal) {
    return this.orders.myOrders(me.customerId);
  }

  /** پیش‌نمایشِ تخفیفِ کوپن روی سبد — پیش از ثبت سفارش. */
  @UseGuards(CustomerAuthGuard)
  @Post('coupon/preview')
  couponPreview(
    @CurrentCustomer() me: CustomerPrincipal,
    @Body() dto: PreviewCouponDto,
  ) {
    return this.orders.couponPreview(me.customerId, dto.code, dto.lines);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('orders/:id')
  myOrder(
    @CurrentCustomer() me: CustomerPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.myOrder(me.customerId, id);
  }

  @UseGuards(CustomerAuthGuard)
  @Post('orders/:id/cancel')
  cancelOrder(
    @CurrentCustomer() me: CustomerPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.cancel(me.customerId, id);
  }

  // ─────────── علاقه‌مندی (نیازمند ورود) ───────────

  /** فقط شناسه‌ها — کلاینت با آن آیکنِ قلبِ کارت‌ها را رنگ می‌کند. */
  @UseGuards(CustomerAuthGuard)
  @Get('favorites/ids')
  favoriteIds(@CurrentCustomer() me: CustomerPrincipal) {
    return this.favorites.ids(me.customerId);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('favorites')
  myFavorites(@CurrentCustomer() me: CustomerPrincipal) {
    return this.favorites.list(me.customerId);
  }

  @UseGuards(CustomerAuthGuard)
  @Post('favorites/:productId')
  addFavorite(
    @CurrentCustomer() me: CustomerPrincipal,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.favorites.add(me.customerId, productId);
  }

  @UseGuards(CustomerAuthGuard)
  @Delete('favorites/:productId')
  removeFavorite(
    @CurrentCustomer() me: CustomerPrincipal,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.favorites.remove(me.customerId, productId);
  }

  // ─────────── ثبت نظر (نیازمند ورود) ───────────

  @UseGuards(CustomerAuthGuard)
  @Post('products/:id/reviews')
  createReview(
    @CurrentCustomer() me: CustomerPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(me.customerId, id, dto);
  }
}
