/**
 * Encodes a 32-bit RGBA pixel buffer into a standard BMP file buffer.
 * Uses top-down BITMAPINFOHEADER with 32-bits per pixel (BGRA).
 */
export function encodeBmp(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const absHeight = Math.abs(height);
  const pixelBytes = width * absHeight * 4;
  const fileSize = 54 + pixelBytes;
  const buf = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER (14 bytes)
  buf.write('BM', 0); // Signature
  buf.writeUInt32LE(fileSize, 2); // File size
  buf.writeUInt16LE(0, 6); // Reserved
  buf.writeUInt16LE(0, 8); // Reserved
  buf.writeUInt32LE(54, 10); // Offset to pixel array

  // BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, 14); // Header size
  buf.writeInt32LE(width, 18); // Width
  buf.writeInt32LE(-absHeight, 22); // Height (negative indicates top-down order)
  buf.writeUInt16LE(1, 26); // Color planes
  buf.writeUInt16LE(32, 28); // Bits per pixel (32 bpp BGRA)
  buf.writeUInt32LE(0, 30); // Compression (0 = BI_RGB)
  buf.writeUInt32LE(pixelBytes, 34); // Image size
  buf.writeInt32LE(2835, 38); // Horizontal resolution (pixels/meter ~ 72 DPI)
  buf.writeInt32LE(2835, 42); // Vertical resolution
  buf.writeUInt32LE(0, 46); // Colors in palette
  buf.writeUInt32LE(0, 50); // Important colors

  // Pixel data (convert RGBA to BGRA)
  let outPos = 54;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];

    buf[outPos] = b;
    buf[outPos + 1] = g;
    buf[outPos + 2] = r;
    buf[outPos + 3] = a;

    outPos += 4;
  }

  return buf;
}
