package com.warehouseos.operator.data.photo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Camera file handling + on-device compression for worker photos.
 *
 * Compression happens BEFORE the photo is queued, not at upload time, because the
 * server re-encodes to a 1600px JPEG anyway — keeping a 4 MB original would burn
 * the worker's storage all day and then be thrown away server-side. Target here
 * matches what the server expects (~200 KB).
 *
 * Rotation is applied here on purpose: re-encoding through [Bitmap] drops EXIF,
 * so the server's `.rotate()` has nothing left to read. Skipping this would land
 * every portrait photo sideways in the manager's review queue.
 */
@Singleton
class PhotoStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /** Full-resolution camera output — transient, deleted after compression. */
    private fun captureDir(): File = File(context.cacheDir, CAPTURE_DIR).apply { mkdirs() }

    /** Compressed queue files — app-private, survive restarts until uploaded. */
    private fun photoDir(): File = File(context.filesDir, PHOTO_DIR).apply { mkdirs() }

    fun createCaptureFile(): File = File(captureDir(), "capture-${UUID.randomUUID()}.jpg")

    /** Content URI the camera app is allowed to write into. */
    fun captureUri(file: File): Uri =
        FileProvider.getUriForFile(context, "${context.packageName}$AUTHORITY_SUFFIX", file)

    /**
     * Decodes [source], downscales to [MAX_EDGE], applies the EXIF rotation and
     * writes a JPEG into app-private storage. Returns null when the image can't
     * be read — the caller treats that as "no photo", never as a crash.
     */
    fun compress(source: Uri): File? {
        val orientation = readOrientation(source)

        // Bounds pass. decodeStream returns null BY DESIGN when inJustDecodeBounds
        // is set — the answer is written into `bounds`, not returned. Treating that
        // null as failure silently threw away every photo the worker ever took.
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        openStream(source) { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        // Subsample during decode so a 12 MP capture never lands in memory whole.
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight)
        }
        val decoded = openStream(source) { BitmapFactory.decodeStream(it, null, options) }
            ?: return null

        val scaled = scaleToMaxEdge(decoded)
        val rotated = applyOrientation(scaled, orientation)

        val target = File(photoDir(), "photo-${UUID.randomUUID()}.jpg")
        val written = runCatching {
            FileOutputStream(target).use { out ->
                rotated.compress(Bitmap.CompressFormat.JPEG, QUALITY, out)
            }
        }.getOrDefault(false)
        rotated.recycle()

        if (!written || target.length() == 0L) {
            target.delete()
            return null
        }
        return target
    }

    /** Removes the transient full-resolution capture once it has been compressed. */
    fun deleteCapture(file: File) {
        runCatching { file.delete() }
    }

    fun delete(path: String) {
        runCatching { File(path).delete() }
    }

    // ---------- internals ----------

    private fun <T> openStream(source: Uri, block: (java.io.InputStream) -> T): T? =
        runCatching {
            context.contentResolver.openInputStream(source)?.use(block)
        }.getOrNull()

    private fun readOrientation(source: Uri): Int =
        openStream(source) { ExifInterface(it).getAttributeInt(
            ExifInterface.TAG_ORIENTATION,
            ExifInterface.ORIENTATION_NORMAL,
        ) } ?: ExifInterface.ORIENTATION_NORMAL

    /** Largest power-of-two subsample that still leaves us above the target edge. */
    private fun sampleSizeFor(width: Int, height: Int): Int {
        var sample = 1
        var longest = maxOf(width, height)
        while (longest / 2 >= MAX_EDGE) {
            longest /= 2
            sample *= 2
        }
        return sample
    }

    private fun scaleToMaxEdge(bitmap: Bitmap): Bitmap {
        val longest = maxOf(bitmap.width, bitmap.height)
        if (longest <= MAX_EDGE) return bitmap
        val ratio = MAX_EDGE.toFloat() / longest
        val scaled = Bitmap.createScaledBitmap(
            bitmap,
            (bitmap.width * ratio).toInt().coerceAtLeast(1),
            (bitmap.height * ratio).toInt().coerceAtLeast(1),
            true,
        )
        if (scaled !== bitmap) bitmap.recycle()
        return scaled
    }

    private fun applyOrientation(bitmap: Bitmap, orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            else -> return bitmap
        }
        val rotated = runCatching {
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        }.getOrNull() ?: return bitmap
        if (rotated !== bitmap) bitmap.recycle()
        return rotated
    }

    private companion object {
        const val CAPTURE_DIR = "captures"
        const val PHOTO_DIR = "photos"
        const val AUTHORITY_SUFFIX = ".fileprovider"

        /** Matches the server's stored size — anything larger is re-encoded away. */
        const val MAX_EDGE = 1600
        const val QUALITY = 75
    }
}
