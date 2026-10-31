import ExpoModulesCore
import Foundation
import ImageIO
import Vision

public final class CustomerTyreScannerModule: Module {
  private let scanQueue = DispatchQueue(label: "uk.tyrerescue.customer.tyre-scanner", qos: .userInitiated, attributes: .concurrent)
  private let scanLock = NSLock()
  private var scanning = false

  public func definition() -> ModuleDefinition {
    Name("CustomerTyreScanner")

    AsyncFunction("recognizeText") { (imageUri: String, promise: Promise) in
      self.scanLock.lock()
      let alreadyScanning = self.scanning
      if !alreadyScanning { self.scanning = true }
      self.scanLock.unlock()
      guard !alreadyScanning else {
        promise.reject("ERR_TYRE_SCAN_BUSY", "A photo is still being read. Please wait and try again.")
        return
      }
      defer {
        self.scanLock.lock()
        self.scanning = false
        self.scanLock.unlock()
      }

      guard let url = URL(string: imageUri), url.isFileURL,
        url.host == nil || url.host == "" || url.host == "localhost" else {
        promise.reject("ERR_TYRE_SCAN_URI", "Choose a photo stored on this device.")
        return
      }

      // Do not upload or fetch images. ImageIO downsamples before decoding and
      // applies EXIF rotation/mirroring, avoiding a full-size camera bitmap.
      autoreleasepool {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
          let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 2560,
            kCGImageSourceShouldCacheImmediately: true
          ] as CFDictionary) else {
          promise.reject("ERR_TYRE_SCAN_IMAGE", "This photo could not be opened. Take another photo or choose a different image.")
          return
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["en-US"]
        // Sidewall dimensions are technical markings, not prose to autocorrect.
        request.usesLanguageCorrection = false
        request.minimumTextHeight = 0.008

        do {
          try VNImageRequestHandler(cgImage: image, orientation: .up).perform([request])
          let text = (request.results ?? []).prefix(100)
            .compactMap { $0.topCandidates(1).first?.string }
            .joined(separator: "\n")
          promise.resolve(String(text.prefix(12000)))
        } catch {
          promise.reject("ERR_TYRE_SCAN_FAILED", "The photo could not be read. Try a clearer photo or enter the size manually.")
        }
      }
    }.runOnQueue(scanQueue)
  }
}
