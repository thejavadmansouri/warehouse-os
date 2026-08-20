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

export interface WorkTaskPushPayload {
  type: 'work-task-created' | 'work-task-cancelled';
  /** فقط شناسه‌ها — کلاینت جزئیات را از REST (guard‌شده) می‌گیرد. */
  taskIds: string[];
}

/**
 * کانالِ push برای کارهای کارگر (WorkTask).
 *
 * الگوی دقیق PickTasksGateway: ws خام روی همان پورت HTTP، احراز با همان JWT
 * (زیر /work-tasks/ws?token=...)، و گروه‌بندی per-user تا پیامِ تخصیص‌داده‌شده
 * فقط به همان کارگر برسد و پیامِ «هر کارگری» به همه‌ی اتصال‌های زنده.
 *
 * push هیچ‌وقت نباید باعث شکستِ عملیاتِ اصلی شود — Task از قبل commit شده و
 * گوشیِ کارگر polling (WorkManager) را fallback دارد؛ پس خطاها فقط log می‌شوند.
 */
@Injectable()
@WebSocketGateway({ path: '/work-tasks/ws' })
export class WorkTasksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WorkTasksGateway.name);

  @WebSocketServer()
  private readonly server!: WsServer;

  /** userId → سوکت‌های زنده‌ی همان کارگر. */
  private readonly byUser = new Map<string, Set<WebSocket>>();

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: WebSocket, request?: IncomingMessage) {
    const token = this.extractToken(request?.url);
    if (!token) {
      client.close(4001, 'missing token');
      return;
    }
    let userId: string;
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token);
      if (!payload?.sub) throw new Error('token has no subject');
      userId = payload.sub;
    } catch {
      client.close(4003, 'invalid token');
      return;
    }

    (client as unknown as { userId: string }).userId = userId;
    const set = this.byUser.get(userId) ?? new Set<WebSocket>();
    set.add(client);
    this.byUser.set(userId, set);
    this.logger.log(`work-task socket connected: user=${userId}`);
  }

  handleDisconnect(client: WebSocket) {
    const userId = (client as unknown as { userId?: string }).userId;
    if (!userId) return;
    const set = this.byUser.get(userId);
    set?.delete(client);
    if (set?.size === 0) this.byUser.delete(userId);
    this.logger.log(`work-task socket disconnected: user=${userId}`);
  }

  /** کارگرِ مشخص حداقل یک اتصال زنده دارد؟ (برای لاگ/تست) */
  isConnected(userId: string): boolean {
    return (this.byUser.get(userId)?.size ?? 0) > 0;
  }

  /**
   * Task تازه ساخت → همان لحظه push کن.
   * forUserId = null یعنی «هر کارگری» → برای همه‌ی اتصال‌های زنده.
   */
  emitCreated(taskIds: string[], forUserId?: string | null) {
    this.push({ type: 'work-task-created', taskIds }, forUserId);
  }

  emitCancelled(taskIds: string[], forUserId?: string | null) {
    this.push({ type: 'work-task-cancelled', taskIds }, forUserId);
  }

  private push(payload: WorkTaskPushPayload, forUserId?: string | null) {
    const message = JSON.stringify(payload);
    if (forUserId) {
      this.byUser.get(forUserId)?.forEach((ws) => this.send(ws, message));
    } else {
      for (const sockets of this.byUser.values()) {
        sockets.forEach((ws) => this.send(ws, message));
      }
    }
  }

  private send(ws: WebSocket, message: string) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(message);
    } catch (err) {
      this.logger.warn(`work-task push failed: ${(err as Error).message}`);
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
