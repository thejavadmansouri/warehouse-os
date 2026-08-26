import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as net from 'net';
import * as dns from 'dns';
// Import fetch from undici (not Node's global fetch): the global fetch is backed
// by Node's *internal* undici and rejects a dispatcher created from this package
// ("invalid onRequestStart method"). Using undici's own fetch keeps the fetch and
// the Agent version-compatible so the SSRF dispatcher actually applies.
import { Agent, fetch as undiciFetch } from 'undici';

export interface DownloadResult {
  buffer: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  sha256: string;
  fileName: string;
}

/** Maximum download size: 10 MB */
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
/** Maximum Content-Length we accept before downloading */
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
/** Allowed MIME types for images */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Downloads images from URLs with comprehensive SSRF protection.
 *
 * The core defense is an undici dispatcher whose custom `lookup` runs at the
 * moment each socket is connected — for the initial request AND for every
 * redirect hop. It resolves the hostname (IPv4 + IPv6), rejects the connection
 * if ANY resolved address is internal, and then connects to the exact address
 * it just validated. Because validation happens at connect time on the pinned
 * address, this closes three classes of SSRF that a plain `fetch` leaves open:
 *   - redirect to an internal target (302 → http://169.254.169.254/…)
 *   - DNS rebinding (validate one IP, connect to another)
 *   - IPv6 / IPv4-mapped internal addresses
 *
 * Additional measures: HTTP/HTTPS only, Content-Length & post-download size
 * limits, magic-byte MIME sniffing, and a request timeout.
 */
@Injectable()
export class ImageDownloadService {
  private readonly logger = new Logger(ImageDownloadService.name);

  /**
   * Shared undici dispatcher that validates every connection's IP at connect
   * time. Built lazily so tests that never download don't spin up a pool.
   */
  private ssrfAgent?: Agent;

  private getAgent(): Agent {
    if (!this.ssrfAgent) {
      this.ssrfAgent = new Agent({
        connect: {
          // Node's connect `lookup` contract: (hostname, options, cb) where cb
          // is (err, address, family) with a single address to connect to.
          lookup: (
            hostname: string,
            _options: dns.LookupOneOptions,
            callback: (
              err: NodeJS.ErrnoException | null,
              address: string,
              family: number,
            ) => void,
          ) => {
            dns.lookup(hostname, { all: true }, (err, addresses) => {
              if (err) return callback(err, '', 0);
              if (!addresses.length) {
                return callback(
                  new Error(`Host did not resolve: ${hostname}`) as NodeJS.ErrnoException,
                  '',
                  0,
                );
              }
              for (const a of addresses) {
                if (this.isBlockedIp(a.address)) {
                  return callback(
                    new Error(
                      `SSRF blocked: ${hostname} resolves to internal address ${a.address}`,
                    ) as NodeJS.ErrnoException,
                    '',
                    0,
                  );
                }
              }
              const chosen = addresses[0];
              callback(null, chosen.address, chosen.family);
            });
          },
        },
      });
    }
    return this.ssrfAgent;
  }

  /**
   * Download an image from a URL with full security validation.
   */
  async downloadImage(url: string): Promise<DownloadResult> {
    // Fetch, following redirects manually so every hop is validated (see
    // guardedFetch). Redirects to internal hosts — hostname or literal IP — are
    // refused before we ever connect.
    const response = await this.guardedFetch(url);

    if (!response.ok) {
      throw new BadRequestException(`Download failed: HTTP ${response.status}`);
    }

    // 3. Check Content-Length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_CONTENT_LENGTH) {
      throw new BadRequestException('File too large (Content-Length exceeds 10MB)');
    }

    // 4. Check Content-Type
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (contentType && !ALLOWED_MIME.has(contentType)) {
      throw new BadRequestException(`Unsupported MIME type: ${contentType}`);
    }

    // 5. Download with size limit
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new BadRequestException('File too large (exceeds 10MB after download)');
    }
    if (arrayBuffer.byteLength === 0) {
      throw new BadRequestException('Empty file');
    }

    const buffer = Buffer.from(arrayBuffer);

    // 6. Validate magic bytes
    const detectedMime = this.sniffMime(buffer);
    if (!detectedMime) {
      throw new BadRequestException('File is not a valid image (magic bytes check failed)');
    }

    // 7. Compute SHA-256
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    // 8. Determine file extension
    const ext = this.mimeToExt(detectedMime);
    const fileName = `candidate-${sha256.slice(0, 12)}${ext}`;

    return {
      buffer,
      mimeType: detectedMime,
      sha256,
      fileName,
    };
  }

  /**
   * Validate URL scheme and basic structure.
   */
  private validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only HTTP/HTTPS URLs are allowed');
    }
  }

  /**
   * Fetch following redirects MANUALLY so every hop's host is validated before
   * we connect to it.
   *
   * This is required because undici only invokes the dispatcher's `lookup` for
   * hostnames that need DNS resolution — a redirect straight to a literal
   * internal IP (e.g. http://169.254.169.254/) never hits `lookup` and would
   * otherwise be connected to directly. Manual following lets us reject such a
   * hop by its URL. The connect-time `lookup` in getAgent() stays on as a
   * backstop against DNS rebinding for hostname hops.
   */
  private async guardedFetch(
    initialUrl: string,
  ): Promise<Awaited<ReturnType<typeof undiciFetch>>> {
    const MAX_REDIRECTS = 5;
    let currentUrl = initialUrl;

    for (let hop = 0; ; hop++) {
      this.validateUrl(currentUrl);
      await this.assertHostAllowed(new URL(currentUrl).hostname);

      const response = await undiciFetch(currentUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30000),
        redirect: 'manual',
        dispatcher: this.getAgent(),
      });

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        if (hop >= MAX_REDIRECTS) {
          throw new BadRequestException('Too many redirects');
        }
        // Release the redirect response body before following the next hop.
        try {
          await response.body?.cancel();
        } catch {
          /* ignore */
        }
        // Resolve relative redirects against the current URL.
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      return response;
    }
  }

  /**
   * Reject the host unless it is a public, routable address. Handles both
   * literal IPs (validated directly, since undici skips `lookup` for them) and
   * hostnames (resolved to all A/AAAA records, all of which must be public).
   * Fails closed: a host that cannot be resolved is rejected.
   */
  private async assertHostAllowed(hostname: string): Promise<void> {
    // Strip IPv6 brackets: "[::1]" -> "::1".
    const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

    if (net.isIP(host)) {
      if (this.isBlockedIp(host)) {
        throw new BadRequestException('Access to private/internal IPs is blocked');
      }
      return;
    }

    let addresses: string[];
    try {
      addresses = await this.resolveAll(host);
    } catch {
      throw new BadRequestException(`Cannot resolve host: ${host}`);
    }
    if (!addresses.length) {
      throw new BadRequestException(`Host did not resolve: ${host}`);
    }
    for (const addr of addresses) {
      if (this.isBlockedIp(addr)) {
        throw new BadRequestException(
          'Host resolves to a private/internal address',
        );
      }
    }
  }

  private resolveAll(hostname: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      dns.lookup(hostname, { all: true }, (err, addresses) => {
        if (err) return reject(err);
        resolve(addresses.map((a) => a.address));
      });
    });
  }

  /**
   * Return true if an IP address is loopback, private, link-local, unique-local,
   * CGNAT, multicast, or otherwise not a routable public address. Handles IPv4,
   * IPv6, and IPv4-mapped IPv6 (::ffff:a.b.c.d). Anything malformed is blocked.
   */
  private isBlockedIp(ip: string): boolean {
    // Unwrap IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) to its IPv4 form.
    const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    const target = mapped ? mapped[1] : ip;

    if (net.isIPv4(target)) {
      const parts = target.split('.').map(Number);
      if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
        return true; // malformed → block
      }
      const [a, b] = parts;
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 127) return true; // 127.0.0.0/8 loopback
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
      if (a === 0) return true; // 0.0.0.0/8
      if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
      if (a >= 224) return true; // 224.0.0.0/3 multicast + reserved
      return false;
    }

    if (net.isIPv6(target)) {
      const v6 = target.toLowerCase();
      if (v6 === '::1' || v6 === '::') return true; // loopback / unspecified
      if (v6.startsWith('fe80')) return true; // link-local fe80::/10
      if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // unique-local fc00::/7
      if (v6.startsWith('ff')) return true; // multicast ff00::/8
      if (v6.startsWith('::ffff:')) return true; // any remaining v4-mapped form
      return false;
    }

    // Not a recognizable IP literal → block defensively.
    return true;
  }

  /**
   * Detect image MIME type from magic bytes.
   */
  private sniffMime(buf: Buffer): string | null {
    if (buf.length < 12) return null;

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return 'image/png';
    }

    // WebP: RIFF....WEBP
    if (
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }

    // GIF: GIF87a or GIF89a
    if (
      buf.toString('ascii', 0, 3) === 'GIF' &&
      (buf[3] === 0x37 || buf[3] === 0x39)
    ) {
      return 'image/gif';
    }

    return null;
  }

  private mimeToExt(mime: string): string {
    switch (mime) {
      case 'image/jpeg': return '.jpg';
      case 'image/png': return '.png';
      case 'image/webp': return '.webp';
      case 'image/gif': return '.gif';
      default: return '.jpg';
    }
  }
}
