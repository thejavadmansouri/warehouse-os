import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer as WsServer } from 'ws';
import { RealtimeEvent } from './realtime.events';

/**
 * کانال عمومیِ realtime برای پنل ادمین — «همین لحظه بدون رفرش».
 *
 * وقتی جایی در سیستم چیزی عوض می‌شود (فاکتور، موجودی، رسید، مرجوعی)، سرویس
 * مربوطه یک رویداد سبک به این gateway می‌دهد و اینجا برای همه‌ی سوکت‌های
 * احرازشده push می‌شود. کلاینت با گرفتن رویداد، کوئریِ مربوطه را invalidate
 * می‌کند و React Query داده را از همان endpointِ guard-شده دوباره می‌گیرد.
 *
 * الگو دقیقاً همان PickTasksGateway است: ws خام (بدون socket.io)، احراز با
 * JWTِ همان REST از طریق /events/ws?token=<JWT>. تفاوت: اینجا گروه‌بندی per-user
 * لازم نیست، چون این‌ها اعلانِ عمومیِ پنل‌اند و هیچ داده‌ی حساسی حمل نمی‌کنند —
 * پس به هر سوکتِ احرازشده broadcast می‌شود.
 */
@Injectable()
@WebSocketGateway({ path: '/events/ws' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  /** نگه‌داشتن رفرنس سرور تا Nest listenerِ WS را روی همان پورت HTTP بوت کند. */
  @WebSocketServer()
  private readonly server!: WsServer;

  /** همه‌ی سوکت‌های زنده‌ی احرازشده. */
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: WebSocket, request?: IncomingMessage) {
    const token = this.extractToken(request?.url);
    if (!token) {
      client.close(4001, 'missing token');
      return;
    }
    // شناسه‌ی کاربر در `sub` است (مثل JwtStrategy.validate)؛ اینجا فقط برای
    // اطمینان از معتبربودنِ توکن verify می‌کنیم — نیازی به نگه‌داشتنش نداریم.
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      if (!payload?.sub) throw new Error('token has no subject');
    } catch {
      client.close(4003, 'invalid token');
      return;
    }

    this.clients.add(client);
    this.logger.log(`events socket connected (total=${this.clients.size})`);
  }

  handleDisconnect(client: WebSocket) {
    this.clients.delete(client);
    this.logger.log(`events socket disconnected (total=${this.clients.size})`);
  }

  /** آیا حداقل یک شنونده‌ی زنده وجود دارد؟ (برای لاگ/تست) */
  get listenerCount(): number {
    return this.clients.size;
  }

  /**
   * یک رویداد را همان لحظه به همه‌ی سوکت‌های زنده push کن.
   *
   * push هیچ‌وقت نباید باعث شکستِ عملیاتِ اصلی شود — عملیات از قبل commit شده و
   * کلاینت به‌عنوان fallback خودش هم رفرش/poll دارد؛ پس خطاها فقط log می‌شوند.
   */
  broadcast(event: RealtimeEvent) {
    const message = JSON.stringify({
      ...event,
      at: event.at ?? new Date().toISOString(),
    });
    for (const ws of this.clients) this.send(ws, message);
  }

  private send(ws: WebSocket, message: string) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(message);
    } catch (err) {
      this.logger.warn(`events push failed: ${(err as Error).message}`);
    }
  }

  private extractToken(url?: string): string | null {
    if (!url) return null;
    try {
      return new URL(url, 'ws://localhost').searchParams.get('token');
    } catch {
      return null;
    }
  }
}
