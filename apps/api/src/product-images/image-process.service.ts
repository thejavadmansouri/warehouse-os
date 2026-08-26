import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { createHash } from 'crypto';

export interface ProcessedImage {
  /** Processed WebP buffer */
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
  format: string;
}

export interface ProcessedImageSet {
  master: ProcessedImage;   // Max 1200x1200
  product: ProcessedImage;  // Max 800x800
  thumbnail: ProcessedImage; // Max 300x300
}

/** Standard dimensions */
const MASTER_MAX = 1200;
const PRODUCT_MAX = 800;
const THUMB_MAX = 300;
const PADDING_PERCENT = 5; // 5% padding on each side
const WEBP_QUALITY = 82;

@Injectable()
export class ImageProcessService {
  private readonly logger = new Logger(ImageProcessService.name);

  /**
   * Process an image into three sizes: master, product, and thumbnail.
   *
   * Pipeline:
   * 1. Validate (sharp will throw if corrupt)
   * 2. Auto-rotate (EXIF orientation)
   * 3. Remove metadata (EXIF, GPS, etc.)
   * 4. Center product in frame with consistent padding
   * 5. Resize to target dimensions
   * 6. Convert to WebP
   * 7. Compress
   */
  async processImage(inputBuffer: Buffer): Promise<ProcessedImageSet> {
    // Validate image is processable
    const metadata = await sharp(inputBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not read image dimensions');
    }

    // Process all three sizes in parallel
    const [master, product, thumbnail] = await Promise.all([
      this.resizeToSize(inputBuffer, MASTER_MAX),
      this.resizeToSize(inputBuffer, PRODUCT_MAX),
      this.resizeToSize(inputBuffer, THUMB_MAX),
    ]);

    return { master, product, thumbnail };
  }

  /**
   * Process image for a single target size.
   * Adds consistent padding, centers the product, converts to WebP.
   */
  private async resizeToSize(
    inputBuffer: Buffer,
    maxSize: number,
  ): Promise<ProcessedImage> {
    const padding = Math.round(maxSize * (PADDING_PERCENT / 100));
    const targetSize = maxSize - padding * 2; // Usable area inside padding

    // Resize to fit inside target, preserving aspect ratio
    const resized = await sharp(inputBuffer)
      .rotate() // Auto-rotate based on EXIF
      .resize({
        width: targetSize,
        height: targetSize,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer({ resolveWithObject: true });

    const { info } = resized;

    // Create a white canvas with padding and center the image
    const canvas = await sharp({
      create: {
        width: maxSize,
        height: maxSize,
        channels: 4, // RGBA
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{
        input: resized.data,
        left: Math.round((maxSize - info.width) / 2),
        top: Math.round((maxSize - info.height) / 2),
      }])
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: canvas.data,
      width: canvas.info.width,
      height: canvas.info.height,
      size: canvas.data.length,
      format: 'webp',
    };
  }

  /**
   * Validate an image buffer - checks if it can be processed by sharp.
   */
  async validateImage(buffer: Buffer): Promise<{ valid: boolean; error?: string }> {
    try {
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) {
        return { valid: false, error: 'Could not read image dimensions' };
      }
      // Minimum resolution check
      if (metadata.width < 100 || metadata.height < 100) {
        return { valid: false, error: `Image too small: ${metadata.width}x${metadata.height}` };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Invalid image: ${(error as Error).message}` };
    }
  }

  /**
   * Compute SHA-256 hash of a buffer.
   */
  computeSha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Compute a simple perceptual hash (average hash) for near-duplicate detection.
   * This is a simplified version - for production you might use a dedicated library.
   */
  async computePerceptualHash(buffer: Buffer): Promise<string> {
    try {
      // Resize to 16x16 grayscale, then compute average hash
      const resized = await sharp(buffer)
        .resize(16, 16, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();

      // Compute average pixel value
      let sum = 0;
      for (let i = 0; i < resized.length; i++) {
        sum += resized[i];
      }
      const avg = sum / resized.length;

      // Create hash: each bit represents whether pixel is above/below average
      let hash = '';
      for (let i = 0; i < resized.length; i++) {
        hash += resized[i] >= avg ? '1' : '0';
      }

      // Convert binary string to hex
      let hex = '';
      for (let i = 0; i < hash.length; i += 4) {
        hex += parseInt(hash.slice(i, i + 4), 2).toString(16);
      }
      return hex;
    } catch {
      return '';
    }
  }

  /**
   * Compute hamming distance between two perceptual hashes.
   */
  hammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) return Infinity;
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
      // Count set bits
      let val = xor;
      while (val) {
        distance += val & 1;
        val >>>= 1;
      }
    }
    return distance;
  }
}
