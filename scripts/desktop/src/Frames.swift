// The take folder writer and the frame compositor (window image + house cursor on a 2880x1620 canvas).
import AppKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

// MARK: - writer

/// Writes fNNNNN.jpg and their capture times on its own queue, so capture never waits on JPEG encoding.
/// Same files as scripts/frame-receiver.mjs; ts.txt is written last and marks the take as finished.
final class FrameWriter {
    enum Outcome { case written, limit, failed }

    let directory: URL
    static let maxFrames = 5400  // 3 min at 30fps, the receiver's hard stop per take
    static let maxPending = 8

    private let queue = DispatchQueue(label: "deskcap.writer")
    private let lock = NSLock()
    private var written = 0
    private var pending = 0
    private var dropped = 0
    private var closed = false
    private var error: String?
    private let stamps: FileHandle

    init(directory: URL, layout: Layout) throws {
        self.directory = directory
        try prepareTakeFolder(directory)
        guard try freeBytes(at: directory) >= minimumFreeBytes else {
            throw fail("under \(minimumFreeBytes / 1_073_741_824) GB free on the disk; free space before recording")
        }
        let layoutData = try JSONEncoder().encode(layout)
        try writeNoFollow(directory.appendingPathComponent("layout.json"), layoutData, exclusive: true)
        stamps = try openNoFollow(directory.appendingPathComponent("ts.partial"), flags: O_WRONLY | O_CREAT | O_EXCL | O_APPEND)
    }

    var count: Int { lock.withLock { written } }
    var droppedCount: Int { lock.withLock { dropped } }
    var failure: String? { lock.withLock { error } }
    var isFull: Bool { lock.withLock { written + pending >= FrameWriter.maxFrames } }

    /// Queues one frame. Drops it (and counts the drop) when encoding falls behind.
    func submit(_ image: CGImage, at stamp: Double) {
        let accepted: Bool = lock.withLock {
            guard !closed, error == nil, written + pending < FrameWriter.maxFrames else { return false }
            guard pending < FrameWriter.maxPending else { dropped += 1; return false }
            pending += 1
            return true
        }
        guard accepted else { return }
        queue.async { self.encode(image, at: stamp) }
    }

    private func encode(_ image: CGImage, at stamp: Double) {
        let index = lock.withLock { written }
        do {
            let data = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else {
                throw fail("cannot create a JPEG encoder")
            }
            CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { throw fail("JPEG encoding failed for frame \(index)") }
            try writeNoFollow(directory.appendingPathComponent(String(format: "f%05d.jpg", index)), data as Data, exclusive: true)
            try stamps.write(contentsOf: Data(String(format: "%.4f\n", stamp).utf8))
            if index % 150 == 149, try freeBytes(at: directory) < minimumFreeBytes {
                throw fail("the disk dropped under \(minimumFreeBytes / 1_073_741_824) GB free")
            }
            lock.withLock { written += 1; pending -= 1 }
        } catch {
            lock.withLock { self.error = self.error ?? "\(error)"; pending -= 1 }
        }
    }

    /// Blocks until every queued frame is written (selftest uses it to time encoding).
    func drain() { queue.sync {} }

    /// Waits for queued frames, then writes end.txt and renames ts.partial to ts.txt (the ready marker).
    func finish(end: Double) throws {
        lock.withLock { closed = true }
        queue.sync {}
        try? stamps.close()
        guard count > 0 else { throw fail(failure.map { "no frames were saved: \($0)" } ?? "no frames were captured") }
        try writeNoFollow(directory.appendingPathComponent("end.txt"), Data(String(format: "%.4f", end).utf8))
        guard rename(directory.appendingPathComponent("ts.partial").path, directory.appendingPathComponent("ts.txt").path) == 0 else {
            throw fail("cannot finish ts.txt: \(String(cString: strerror(errno)))")
        }
    }
}

// MARK: - cursor

/// The house cursors from scripts/lib.js, drawn into each frame (the macOS pointer is hidden in the capture).
struct CursorArt {
    enum Style: String { case hand, arrow }

    let image: CGImage
    let pressed: CGImage
    let hotspot: CGPoint  // window points from the image's top-left corner
    let size: CGSize  // window points
    let pressedScale: Double

    static let handSVG = ##"<svg width="34" height="39" viewBox="0 0 24 28" xmlns="http://www.w3.org/2000/svg"><path d="M8.5 13V3a1.5 1.5 0 0 1 3 0v8.5v-1a1.5 1.5 0 0 1 3 0V12v-.5a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0V19c0 3-2 6-5 6h-4.5c-2 0-3-1-4-2.5L3.8 17.8a1.4 1.4 0 0 1 2-2L8.5 18Z" fill="#fff" stroke="#111" stroke-width="1.1" stroke-linejoin="round"/><path d="M11.5 15.5v4M14.5 15.5v4M17.5 15.5v4" stroke="#111" stroke-width="0.9" stroke-linecap="round"/></svg>"##
    static let arrowSVG = ##"<svg width="19" height="27" viewBox="0 0 16 23" xmlns="http://www.w3.org/2000/svg"><path transform="translate(1.5 1.5)" d="M0 0V16.5L4 12.7L6.6 18.9L9.2 17.8L6.6 11.7H12Z" fill="#000" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/></svg>"##

    init(style: Style, scale: Double) throws {
        let svg = style == .hand ? CursorArt.handSVG : CursorArt.arrowSVG
        size = style == .hand ? CGSize(width: 34, height: 39) : CGSize(width: 19, height: 27)
        hotspot = style == .hand ? CGPoint(x: 14.2, y: 2.2) : CGPoint(x: 1.8, y: 1.8)
        pressedScale = style == .hand ? 0.86 : 0.92
        guard let art = NSImage(data: Data(svg.utf8)) else { throw fail("cannot load the cursor artwork") }
        image = try CursorArt.render(art, size: size, scale: scale)
        pressed = try CursorArt.render(art, size: size, scale: scale * pressedScale)
    }

    private static func render(_ art: NSImage, size: CGSize, scale: Double) throws -> CGImage {
        var rect = CGRect(x: 0, y: 0, width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
        guard let image = art.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { throw fail("cannot draw the cursor") }
        return image
    }
}

// MARK: - compositor

/// Draws one frame: the window image fitted into 2880x1620 (letterboxed if not 16:9) and the cursor.
final class Compositor {
    let layout: Layout
    let cursor: CursorArt?
    private let context: CGContext

    init(layout: Layout, cursor: CursorArt?) throws {
        self.layout = layout
        self.cursor = cursor
        guard let context = CGContext(data: nil, width: Int(Layout.frameWidth), height: Int(Layout.frameHeight), bitsPerComponent: 8,
                                      bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { throw fail("cannot create the frame canvas") }
        context.interpolationQuality = .high
        self.context = context
    }

    /// `pointer` is in window points, nil when the pointer is outside the window.
    func compose(window: CGImage, pointer: CGPoint?, pressed: Bool) -> CGImage? {
        let height = Layout.frameHeight
        context.setFillColor(CGColor(gray: 0, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: Layout.frameWidth, height: height))
        let target = layout.frameRect(layout.windowRect)
        context.draw(window, in: CGRect(x: target.minX, y: height - target.maxY, width: target.width, height: target.height))
        if let cursor, let pointer {
            let art = pressed ? cursor.pressed : cursor.image
            let factor = layout.scale * (pressed ? cursor.pressedScale : 1)
            let tip = layout.framePoint(pointer)
            let rect = CGRect(x: tip.x - cursor.hotspot.x * factor, y: tip.y - cursor.hotspot.y * factor,
                              width: Double(art.width), height: Double(art.height))
            context.saveGState()
            context.setShadow(offset: CGSize(width: 0, height: -layout.scale), blur: 1.5 * layout.scale,
                              color: CGColor(gray: 0, alpha: 0.35))
            context.draw(art, in: CGRect(x: rect.minX, y: height - rect.maxY, width: rect.width, height: rect.height))
            context.restoreGState()
        }
        return context.makeImage()
    }
}
