package uk.tyrerescue.customertyrescanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

class CustomerTyreScannerModule : Module() {
  private val scanning = AtomicBoolean(false)
  // ML Kit invokes completion after processing; keep cleanup on that worker.
  private val completionExecutor = Executor { command -> command.run() }

  override fun definition() = ModuleDefinition {
    Name("CustomerTyreScanner")

    AsyncFunction("recognizeText") { imageUri: String, promise: Promise ->
      if (!scanning.compareAndSet(false, true)) {
        promise.reject("ERR_TYRE_SCAN_BUSY", "A photo is still being read. Please wait and try again.", null)
        return@AsyncFunction
      }

      var bitmap: Bitmap? = null
      var recognizer: TextRecognizer? = null
      try {
        val uri = Uri.parse(imageUri)
        val localFile = uri.scheme == "file" && (uri.host.isNullOrEmpty() || uri.host == "localhost")
        if (!localFile && uri.scheme != "content") {
          promise.reject("ERR_TYRE_SCAN_URI", "Choose a photo stored on this device.", null)
          scanning.set(false)
          return@AsyncFunction
        }
        val context = appContext.reactContext ?: throw IOException("Application context is unavailable")
        val activeBitmap = loadUprightBitmap(context, uri)
        bitmap = activeBitmap
        val image = InputImage.fromBitmap(activeBitmap, 0)
        val activeRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer = activeRecognizer
        activeRecognizer.process(image).addOnCompleteListener(completionExecutor) { task ->
          // Resources remain alive through inference, including if JS has
          // already timed out or navigated away. No shared recognizer is closed
          // by another call, and a new scan cannot overtake an active one.
          try {
            if (task.isSuccessful) {
              promise.resolve(task.result.text.take(12000))
            } else {
              promise.reject("ERR_TYRE_SCAN_FAILED", "The photo could not be read. Try a clearer photo or enter the size manually.", null)
            }
          } finally {
            try {
              activeRecognizer.close()
            } finally {
              activeBitmap.recycle()
              scanning.set(false)
            }
          }
        }
      } catch (_: Exception) {
        try {
          recognizer?.close()
        } finally {
          bitmap?.recycle()
          scanning.set(false)
        }
        promise.reject("ERR_TYRE_SCAN_IMAGE", "This photo could not be opened. Take another photo or choose a different image.", null)
      }
    }.runOnQueue(Queues.DEFAULT)
  }

  private fun loadUprightBitmap(context: Context, uri: Uri): Bitmap {
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds); Unit }
      ?: throw IOException("Photo is unavailable")
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IOException("Invalid image")

    var sampleSize = 1
    while (bounds.outWidth / sampleSize > 2560 || bounds.outHeight / sampleSize > 2560) sampleSize *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
      ?: throw IOException("Photo could not be decoded")

    try {
      val orientation = resolver.openInputStream(uri)?.use {
        ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      } ?: ExifInterface.ORIENTATION_NORMAL
      val transform = Matrix()
      when (orientation) {
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> transform.setScale(-1f, 1f)
        ExifInterface.ORIENTATION_ROTATE_180 -> transform.setRotate(180f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> transform.setScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> { transform.setRotate(90f); transform.postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_90 -> transform.setRotate(90f)
        ExifInterface.ORIENTATION_TRANSVERSE -> { transform.setRotate(-90f); transform.postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_270 -> transform.setRotate(-90f)
      }
      if (transform.isIdentity) return bitmap
      val upright = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, transform, true)
      if (upright !== bitmap) bitmap.recycle()
      return upright
    } catch (error: Exception) {
      bitmap.recycle()
      throw error
    }
  }
}
