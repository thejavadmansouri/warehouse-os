import { Injectable, Logger } from '@nestjs/common';

export interface SearchResult {
  imageUrl: string;
  sourceUrl: string;
  sourceDomain: string;
  title: string;
  thumbnailUrl?: string;
}

export interface SearchQuery {
  query: string;
  label: string;
}

/**
 * Builds multiple search queries for a product and searches for images.
 *
 * Query priority:
 * 1. Brand + Part Number
 * 2. Brand + OEM Number
 * 3. Part Number alone
 * 4. Brand + Product Name
 * 5. Product Name + Vehicle
 */
@Injectable()
export class ImageSearchService {
  private readonly logger = new Logger(ImageSearchService.name);

  /**
   * Build search queries from product metadata, ordered by specificity.
   */
  buildQueries(product: {
    name: string;
    brand?: string | null;
    partNumber?: string | null;
    sku?: string;
    vehicleModel?: string | null;
    category?: string | null;
  }): SearchQuery[] {
    const queries: SearchQuery[] = [];
    const brand = product.brand?.trim();
    const pn = product.partNumber?.trim();
    const name = product.name?.trim();
    const vehicle = product.vehicleModel?.trim();

    // 1. Brand + Part Number (most specific)
    if (brand && pn) {
      queries.push({ query: `${brand} ${pn}`, label: 'Brand+PartNumber' });
      queries.push({ query: `${pn} ${brand}`, label: 'PartNumber+Brand' });
    }

    // 2. Part Number alone
    if (pn) {
      queries.push({ query: pn, label: 'PartNumber' });
    }

    // 3. Brand + Product Name
    if (brand && name) {
      queries.push({ query: `${brand} ${name}`, label: 'Brand+Name' });
    }

    // 4. Product Name alone (only if we have nothing better)
    if (name && queries.length < 2) {
      queries.push({ query: name, label: 'Name' });
    }

    // 5. Product Name + Vehicle
    if (name && vehicle) {
      queries.push({ query: `${name} ${vehicle}`, label: 'Name+Vehicle' });
    }

    // 6. Brand + Name + "part" (to disambiguate from logos/banners)
    if (brand && name) {
      queries.push({ query: `${brand} ${name} part`, label: 'Brand+Name+Part' });
    }

    // Limit to top 5 most specific queries
    return queries.slice(0, 5);
  }

  /**
   * Search for images using Google Images (HTML scraping approach).
   * Returns raw image URLs and source pages.
   */
  async searchImages(
    query: string,
    maxResults: number = 10,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    try {
      // Use Google Custom Search-style approach via fetch
      const encodedQuery = encodeURIComponent(query);
      const url = `https://www.google.com/search?q=${encodedQuery}&tbm=isch&hl=en`;

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        this.logger.warn(`Search failed for query "${query}": ${response.status}`);
        return results;
      }

      const html = await response.text();
      // Extract image URLs from Google's HTML response
      const imageUrls = this.extractImageUrls(html);

      for (const item of imageUrls.slice(0, maxResults)) {
        results.push({
          imageUrl: item.url,
          sourceUrl: item.sourcePage || item.url,
          sourceDomain: this.extractDomain(item.sourcePage || item.url),
          title: item.title || query,
          thumbnailUrl: item.thumbnail,
        });
      }
    } catch (error) {
      this.logger.error(`Image search error for "${query}": ${(error as Error).message}`);
    }

    return results;
  }

  /**
   * Search Google first; if it returns nothing (no hits, or Google served a
   * CAPTCHA/consent page instead of results) fall back to Bing. This is the
   * entry point the pipeline uses, so both engines are actually exercised.
   */
  async searchImagesWithFallback(
    query: string,
    maxResults = 10,
  ): Promise<SearchResult[]> {
    const google = await this.searchImages(query, maxResults);
    if (google.length > 0) return google;
    this.logger.warn(`Google returned no images for "${query}"; falling back to Bing`);
    return this.searchBingImages(query, maxResults);
  }

  /**
   * Search Bing Images as fallback.
   */
  async searchBingImages(
    query: string,
    maxResults: number = 10,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://www.bing.com/images/search?q=${encodedQuery}&form=HDRSC3&first=1`;

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        this.logger.warn(`Bing search failed for "${query}": ${response.status}`);
        return results;
      }

      const html = await response.text();
      const imageUrls = this.extractBingImageUrls(html);

      for (const item of imageUrls.slice(0, maxResults)) {
        results.push({
          imageUrl: item.url,
          sourceUrl: item.sourcePage || item.url,
          sourceDomain: this.extractDomain(item.sourcePage || item.url),
          title: item.title || query,
        });
      }
    } catch (error) {
      this.logger.error(`Bing search error for "${query}": ${(error as Error).message}`);
    }

    return results;
  }

  /**
   * Extract image URLs from Google Images HTML.
   */
  private extractImageUrls(html: string): Array<{
    url: string;
    sourcePage?: string;
    title?: string;
    thumbnail?: string;
  }> {
    const results: Array<{
      url: string;
      sourcePage?: string;
      title?: string;
      thumbnail?: string;
    }> = [];

    // Google embeds image data in script tags as JSON-like structures
    // Look for image URLs in various patterns
    const patterns = [
      // data-src or src attributes in image tags
      /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"]*)?)",[0-9]+,[0-9]+\]/gi,
      // Direct image URL patterns
      /"(https?:\/\/[^"]*(?:\.jpg|\.jpeg|\.png|\.webp)(?:\?[^"]*)?)"/gi,
    ];

    const seen = new Set<string>();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1];
        // Skip Google's own URLs, tracking pixels, tiny images
        if (
          url &&
          !seen.has(url) &&
          !url.includes('google.com') &&
          !url.includes('gstatic.com') &&
          !url.includes('googleapis.com') &&
          !url.includes('encrypted-tbn') &&
          !url.includes('data:image') &&
          !url.includes('favicon') &&
          url.startsWith('http')
        ) {
          seen.add(url);
          results.push({ url });
        }
      }
      if (results.length > 0) break; // First pattern that works is enough
    }

    return results;
  }

  /**
   * Extract image URLs from Bing Images HTML.
   */
  private extractBingImageUrls(html: string): Array<{
    url: string;
    sourcePage?: string;
    title?: string;
  }> {
    const results: Array<{
      url: string;
      sourcePage?: string;
      title?: string;
    }> = [];

    const seen = new Set<string>();

    // Bing puts image data in m attributes or data attributes
    const patterns = [
      /murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/gi,
      /"murl":"(https?:\/\/[^"]+?)"/gi,
      /src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1];
        if (
          url &&
          !seen.has(url) &&
          !url.includes('bing.com') &&
          !url.includes('microsoft.com') &&
          !url.includes('bing.net') &&
          !url.includes('data:image') &&
          url.startsWith('http')
        ) {
          seen.add(url);
          results.push({ url });
        }
      }
      if (results.length > 0) break;
    }

    return results;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}
