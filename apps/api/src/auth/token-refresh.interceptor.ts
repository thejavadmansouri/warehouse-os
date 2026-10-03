import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Sliding session — keeps the worker signed in as long as the phone keeps
 * talking to the server, so login is genuinely a one-time event.
 *
 * JWT is stateless, so "sliding" here means: on any authenticated request whose
 * token is past its half-life, re-issue a fresh 1-day token carrying the SAME
 * session id (`sid`) and hand it back in the `X-Refreshed-Token` response
 * header. The client swaps its stored token for it. The `sid` is preserved on
 * purpose — the single-session rule (jwt.strategy) matches `sid` against the
 * user's `activeSessionId`, so a refreshed token must NOT rotate it or it would
 * invalidate itself.
 *
 * Workers reconnect roughly every couple of hours; each reconnect refreshes the
 * token well before the 1-day expiry, so the window never reaches zero and the
 * outbox never hits a 401 mid-sync. Purely additive: a client that ignores the
 * header (e.g. the web panel today) is unaffected and keeps the old 1-day expiry.
 */
@Injectable()
export class TokenRefreshInterceptor implements NestInterceptor {
  constructor(private readonly jwt: JwtService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        // Never let token refresh break an otherwise-successful response.
        try {
          if (!req?.user) return; // unauthenticated route — nothing to slide

          const auth: string | undefined = req.headers?.authorization;
          if (!auth?.startsWith('Bearer ')) return;

          const decoded: any = this.jwt.decode(auth.slice(7));
          if (!decoded?.exp || !decoded?.iat || !decoded?.sid) return;

          const now = Math.floor(Date.now() / 1000);
          const halfLife = decoded.iat + (decoded.exp - decoded.iat) / 2;
          if (now < halfLife) return; // still fresh — don't churn a new token

          const fresh = this.jwt.sign({
            sub: decoded.sub,
            username: decoded.username,
            role: decoded.role,
            sid: decoded.sid,
          });
          res.setHeader('X-Refreshed-Token', fresh);
        } catch {
          // swallow — refresh is best-effort
        }
      }),
    );
  }
}
