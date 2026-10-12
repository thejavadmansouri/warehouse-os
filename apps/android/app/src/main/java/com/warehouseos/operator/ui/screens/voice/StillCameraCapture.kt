package com.warehouseos.operator.ui.screens.voice

import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.border
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.warehouseos.operator.ui.components.Dimens
import com.warehouseos.operator.ui.components.faNum
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * دوربین داخل‌اپ برای عکس کالا — بدون پرش به اپ دوربین سیستم.
 *
 * شاتر پشت‌سرهم ممکن است؛ بعد از هر شات فایل خام به [onCaptured] داده می‌شود
 * و ViewModel همان‌جا فشرده می‌کند.
 */
@Composable
fun StillCameraCapture(
    photoCount: Int,
    maxPhotos: Int,
    onCaptured: (File) -> Unit,
    onDone: () -> Unit,
    createCaptureFile: () -> File,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val mainExecutor = remember { ContextCompat.getMainExecutor(context) }
    val cameraExecutor: ExecutorService = remember { Executors.newSingleThreadExecutor() }

    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var torchOn by remember { mutableStateOf(false) }
    var taking by remember { mutableStateOf(false) }
    val hasFlash = camera?.cameraInfo?.hasFlashUnit() == true
    val canShoot = photoCount < maxPhotos && !taking

    LaunchedEffect(camera, torchOn) {
        camera?.cameraControl?.enableTorch(torchOn)
    }

    DisposableEffect(Unit) {
        onDispose {
            runCatching { camera?.cameraControl?.enableTorch(false) }
            cameraExecutor.shutdown()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                val previewView = PreviewView(ctx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }
                val providerFuture = ProcessCameraProvider.getInstance(ctx)
                providerFuture.addListener({
                    val provider = providerFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    val capture = ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .build()
                    imageCapture = capture
                    runCatching {
                        provider.unbindAll()
                        provider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            capture,
                        )
                    }.onSuccess { bound -> camera = bound }
                }, mainExecutor)
                previewView
            },
        )

        Text(
            text = "عکس ${faNum(photoCount)} از ${faNum(maxPhotos)}",
            color = Color.White,
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 16.dp)
                .background(Color.Black.copy(alpha = 0.45f), CircleShape)
                .padding(horizontal = 14.dp, vertical = 6.dp),
        )

        Row(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (hasFlash) {
                IconButton(
                    onClick = { torchOn = !torchOn },
                    colors = IconButtonDefaults.iconButtonColors(
                        containerColor = Color.Black.copy(alpha = 0.55f),
                        contentColor = Color.White,
                    ),
                ) {
                    Icon(
                        imageVector = if (torchOn) Icons.Filled.FlashOn else Icons.Filled.FlashOff,
                        contentDescription = if (torchOn) "خاموش کردن چراغ" else "روشن کردن چراغ",
                    )
                }
            }
            IconButton(
                onClick = onDone,
                colors = IconButtonDefaults.iconButtonColors(
                    containerColor = Color.Black.copy(alpha = 0.55f),
                    contentColor = Color.White,
                ),
            ) {
                Icon(Icons.Filled.Close, contentDescription = "بستن دوربین")
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(76.dp)
                    .clip(CircleShape)
                    .border(4.dp, Color.White.copy(alpha = if (canShoot) 1f else 0.35f), CircleShape)
                    .padding(6.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = if (canShoot) 1f else 0.35f))
                    .semantics {
                        contentDescription = "شاتر"
                        role = Role.Button
                    }
                    .clickable(enabled = canShoot) {
                        val capture = imageCapture ?: return@clickable
                        taking = true
                        val file = createCaptureFile()
                        val options = ImageCapture.OutputFileOptions.Builder(file).build()
                        capture.takePicture(
                            options,
                            cameraExecutor,
                            object : ImageCapture.OnImageSavedCallback {
                                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                                    mainExecutor.execute {
                                        taking = false
                                        onCaptured(file)
                                        if (photoCount + 1 >= maxPhotos) onDone()
                                    }
                                }

                                override fun onError(exception: ImageCaptureException) {
                                    mainExecutor.execute {
                                        taking = false
                                        runCatching { file.delete() }
                                    }
                                }
                            },
                        )
                    },
            )

            TextButton(onClick = onDone) {
                Text(
                    text = if (photoCount > 0) "تمام" else "انصراف",
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium,
                )
            }

            Text(
                text = if (photoCount >= maxPhotos) {
                    "حداکثر عکس گرفته شد"
                } else {
                    "شاتر بزنید — می‌توانید چند عکس بگیرید"
                },
                color = Color.White.copy(alpha = 0.85f),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = Dimens.gapSmall),
            )
        }
    }
}
