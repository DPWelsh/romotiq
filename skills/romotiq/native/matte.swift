// matte · a video in, the person's mask out: one 8-bit grey frame per video frame on stdout (width × height bytes each),
// from Apple Vision's person segmentation. Romotiq pipes it into ffmpeg (src/matte.mjs).
// usage: matte <video> [fast|balanced|accurate]      prints "SIZE <w> <h> <frames>" on stderr first, then "MATTE n" as it goes
import AVFoundation
import Vision
import CoreImage
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else { FileHandle.standardError.write("usage: matte <video> [fast|balanced|accurate]\n".data(using: .utf8)!); exit(2) }
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let quality = args.count > 2 ? args[2] : "accurate"
func fail(_ s: String) -> Never { FileHandle.standardError.write(("matte: " + s + "\n").data(using: .utf8)!); exit(1) }

let sem = DispatchSemaphore(value: 0)
var track: AVAssetTrack? = nil
var size = CGSize.zero, transform = CGAffineTransform.identity, frames = 0
Task {
  do {
    let tracks = try await asset.loadTracks(withMediaType: .video)
    track = tracks.first
    if let t = track {
      size = try await t.load(.naturalSize); transform = try await t.load(.preferredTransform)
      let duration = try await asset.load(.duration), fps = try await t.load(.nominalFrameRate)
      frames = Int((CMTimeGetSeconds(duration) * Double(fps)).rounded())
    }
  } catch { fail("can't read the video: \(error)") }
  sem.signal()
}
sem.wait()
guard let video = track else { fail("the video has no picture") }
/* the picture the right way up */
let upright = CGRect(origin: .zero, size: size).applying(transform)
let W = Int(abs(upright.width).rounded()), H = Int(abs(upright.height).rounded())
FileHandle.standardError.write("SIZE \(W) \(H) \(frames)\n".data(using: .utf8)!)

let reader = try! AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: video, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
output.alwaysCopiesSampleData = false
reader.add(output)
guard reader.startReading() else { fail("can't start reading: \(String(describing: reader.error))") }

let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = quality == "fast" ? .fast : quality == "balanced" ? .balanced : .accurate
request.outputPixelFormat = kCVPixelFormatType_OneComponent8
let ctx = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
let out = FileHandle.standardOutput
var grey = [UInt8](repeating: 0, count: W * H)
var n = 0
while let sample = output.copyNextSampleBuffer() {
  autoreleasepool {
    guard let pixels = CMSampleBufferGetImageBuffer(sample) else { return }
    var image = CIImage(cvPixelBuffer: pixels).transformed(by: transform)
    image = image.transformed(by: CGAffineTransform(translationX: -image.extent.origin.x, y: -image.extent.origin.y))
    let handler = VNImageRequestHandler(ciImage: image)
    try? handler.perform([request])
    if let mask = request.results?.first?.pixelBuffer {
      var m = CIImage(cvPixelBuffer: mask)
      m = m.transformed(by: CGAffineTransform(scaleX: CGFloat(W) / m.extent.width, y: CGFloat(H) / m.extent.height))
      ctx.render(m, toBitmap: &grey, rowBytes: W, bounds: CGRect(x: 0, y: 0, width: W, height: H), format: .L8, colorSpace: nil)
    } else { for i in 0..<grey.count { grey[i] = 0 } }
    out.write(Data(grey))
    n += 1
    if n % 30 == 0 { FileHandle.standardError.write("MATTE \(n)\n".data(using: .utf8)!) }
  }
}
FileHandle.standardError.write("MATTE DONE \(n)\n".data(using: .utf8)!)
