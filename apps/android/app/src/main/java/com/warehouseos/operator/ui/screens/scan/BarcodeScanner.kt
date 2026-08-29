package com.warehouseos.operator.ui.screens.scan

import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.annotation.OptIn as AndroidXOptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Reusable CameraX preview + ML Kit barcode/QR analyzer (Epic 5). Detects the
 * first non-blank barcode value and reports it exactly once via
 * [onBarcodeDetected]. It only reads the code — no lookup or business logic.
 *
 * A torch toggle is built in rather than left to each caller: warehouse aisles
 * and bottom shelves are dark enough that scanning fails there, and all five
 * screens that scan need the same escape hatch. The button only appears when the
 * device actually reports a flash unit.
 */
@AndroidXOptIn(markerClass = [ExperimentalGetImage::class])
@Composable
fun BarcodeScanner(
    modifier: Modifier = Modifier,
    onBarcodeDetected: (String) -> Unit,
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnDetected by rememberUpdatedState(onBarcodeDetected)

    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val hasReported = remember { AtomicBoolean(false) }
    val scanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS)
                .build(),
        )
    }

    // Held so the torch can be driven after binding; null until the camera binds.
    var camera by remember { mutableStateOf<Camera?>(null) }
    var torchOn by remember { mutableStateOf(false) }
    val hasFlash = camera?.cameraInfo?.hasFlashUnit() == true

    // Drive the hardware from the UI state, and make sure the torch is not left
    // burning when this screen goes away.
    LaunchedEffect(camera, torchOn) {
        camera?.cameraControl?.enableTorch(torchOn)
    }
    DisposableEffect(Unit) {
        onDispose {
            runCatching { camera?.cameraControl?.enableTorch(false) }
            cameraExecutor.shutdown()
            scanner.close()
        }
    }

    Box(modifier = modifier) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                val previewView = PreviewView(ctx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }
                val providerFuture = ProcessCameraProvider.getInstance(ctx)
                providerFuture.addListener({
                    val cameraProvider = providerFuture.get()

                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also { it.setAnalyzer(cameraExecutor) { proxy -> analyze(scanner, proxy, hasReported, currentOnDetected) } }

                    runCatching {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            analysis,
                        )
                    }.onSuccess { bound -> camera = bound }
                }, ContextCompat.getMainExecutor(ctx))
                previewView
            },
        )

        if (hasFlash) {
            IconButton(
                onClick = { torchOn = !torchOn },
                colors = IconButtonDefaults.iconButtonColors(
                    containerColor = Color.Black.copy(alpha = 0.55f),
                    contentColor = Color.White,
                ),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp)
                    .clip(CircleShape),
            ) {
                Icon(
                    imageVector = if (torchOn) Icons.Filled.FlashOn else Icons.Filled.FlashOff,
                    contentDescription = if (torchOn) "خاموش کردن چراغ" else "روشن کردن چراغ",
                )
            }
        }
    }
}

@AndroidXOptIn(markerClass = [ExperimentalGetImage::class])
private fun analyze(
    scanner: com.google.mlkit.vision.barcode.BarcodeScanner,
    imageProxy: ImageProxy,
    hasReported: AtomicBoolean,
    onBarcodeDetected: (String) -> Unit,
) {
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
        imageProxy.close()
        return
    }
    val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    scanner.process(image)
        .addOnSuccessListener { barcodes ->
            val value = barcodes.firstNotNullOfOrNull { it.rawValue?.takeIf(String::isNotBlank) }
            if (value != null && hasReported.compareAndSet(false, true)) {
                onBarcodeDetected(value)
            }
        }
        .addOnCompleteListener { imageProxy.close() }
}
