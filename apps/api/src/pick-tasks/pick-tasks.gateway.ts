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

export interface PickTaskPushPayload {
  type: 'pick-tasks-created';
  tasks: unknown[];
}

/**
 * WebSocket push for pick tasks — the «همین لحظه زنگ بزن» channel.
 *
 * The operator phone previously discovered new tasks by polling /pick-tasks/mine
 * every few seconds. Now, when a seller creates pick tasks (from the POS), the
 * server pushes them over this socket the moment they exist — the phone rings
 * instantly and uses the poll only as a reconnect fallback.
 *
 * Auth: the client connects to /pick-tasks/ws?token=<JWT>; the same JWT used by
 * the REST API is verified here (JwtModule is global). Connections are grouped
 * by userId so a task assigned to a specific worker only reaches that worker,
 * while unassigned tasks («هر کارگری») fan out to every connected worker.
 */
@Injectable()
@WebSocketGateway({ path: '/pick-tasks/ws' })
export class PickTasksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PickTasksGateway.name);

  /** Keep a server reference so Nest boots the WS listener on the HTTP port. */
  @WebSocketServer()
  private readonly server!: WsServer;

  /** userId → live sockets for that worker. */
  private readonly byUser = new Map<string, Set<WebSocket>>();

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: WebSocket, request?: IncomingMessage) {
    const token = this.extractToken(request?.url);
    if (!token) {
      client.close(4001, 'missing token');
      return;
    }
    // The user id lives in `sub` (see AuthService.login / JwtStrategy.validate) —
    // reading `userId` yielded undefined, which keyed every socket under the same
    // bucket: targeted pushes never arrived and disconnects never unregistered.
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
    this.logger.log(`pick socket connected: user=${userId}`);
  }

  handleDisconnect(client: WebSocket) {
    const userId = (client as unknown as { userId?: string }).userId;
    if (!userId) return;
    const set = this.byUser.get(userId);
    set?.delete(client);
    if (set?.size === 0) this.byUser.delete(userId);
    this.logger.log(`pick socket disconnected: user=${userId}`);
  }

  /** آیا کارگر حداقل یک اتصال زنده دارد؟ (برای لاگ و تست) */
  isConnected(userId: string): boolean {
    return (this.byUser.get(userId)?.size ?? 0) > 0;
  }

  /**
   * کار(های) تازه ساخته شد → همان لحظه push کن.
   * forUserId = null یعنی «هر کارگری» → برای همهی اتصالهای زنده.
   */
  emitNewPickTasks(tasks: unknown[], forUserId?: string | null) {
    const payload: PickTaskPushPayload = { type: 'pick-tasks-created', tasks };
    const message = JSON.stringify(payload);

    if (forUserId) {
      const sockets = this.byUser.get(forUserId);
      sockets?.forEach((ws) => this.send(ws, message));
    } else {
      for (const sockets of this.byUser.values()) {
        sockets.forEach((ws) => this.send(ws, message));
      }
    }
  }

  /**
   * Push failures must never surface as a failed POST /pick-tasks — the tasks are
   * already committed, and the phone's poll picks them up as a fallback.
   */
  private send(ws: WebSocket, message: string) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(message);
    } catch (err) {
      this.logger.warn(`pick push failed: ${(err as Error).message}`);
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
