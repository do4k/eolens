import { DIBReader } from './dib-reader.js';
import { PEReader, type ResourceInfo } from './pe-reader.js';
import { encodeBmp } from './bmp-writer.js';
import { encodePng } from '../png.js';

export interface EgfResourceItem {
  id: number;
  width: number;
  height: number;
  size: number;
}

export interface EgfExtractionResult {
  resourceId: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  bmp: Buffer;
}

export interface EgfSheetResult {
  png: Buffer;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  extracted: number[];
  missing: number[];
}

/**
 * Renders a contact sheet of EGF resources side by side into a PNG.
 * Useful for visually identifying tiles by resource ID. Missing IDs are
 * left blank and reported.
 */
export function sheetEgfResources(
  buffer: ArrayBuffer | Uint8Array,
  resourceIds: number[],
  fileId = 0,
  columns = 8,
): EgfSheetResult {
  const arrayBuf = toArrayBuffer(buffer);
  const thumbs: ({ w: number; h: number; rgba: Uint8ClampedArray } | null)[] = resourceIds.map((id) => {
    try {
      const pe = new PEReader(arrayBuf);
      const info = pe.getResourceInfo(id);
      if (!info) return null;
      const dib = new DIBReader(pe.readResource(info), fileId);
      return { w: dib.width, h: Math.abs(dib.height), rgba: dib.read() };
    } catch {
      return null;
    }
  });

  let cellW = 1;
  let cellH = 1;
  for (const t of thumbs) {
    if (!t) continue;
    if (t.w > cellW) cellW = t.w;
    if (t.h > cellH) cellH = t.h;
  }

  const cols = Math.max(1, columns);
  const rows = Math.max(1, Math.ceil(thumbs.length / cols));
  const width = cols * cellW;
  const height = rows * cellH;
  const sheet = new Uint8ClampedArray(width * height * 4); // transparent black

  const extracted: number[] = [];
  const missing: number[] = [];
  thumbs.forEach((t, n) => {
    const id = resourceIds[n] as number;
    if (!t) {
      missing.push(id);
      return;
    }
    extracted.push(id);
    const ox = (n % cols) * cellW;
    const oy = Math.floor(n / cols) * cellH;
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const si = (y * t.w + x) * 4;
        const di = ((oy + y) * width + ox + x) * 4;
        sheet[di] = t.rgba[si] as number;
        sheet[di + 1] = t.rgba[si + 1] as number;
        sheet[di + 2] = t.rgba[si + 2] as number;
        sheet[di + 3] = t.rgba[si + 3] as number;
      }
    }
  });

  return { png: encodePng(width, height, sheet), width, height, cellWidth: cellW, cellHeight: cellH, extracted, missing };
}

function toArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  const slice = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  return slice as ArrayBuffer;
}

/**
 * Returns a list of all bitmap resource IDs and basic metadata in an EGF archive.
 */
export function listEgfResources(buffer: ArrayBuffer | Uint8Array): EgfResourceItem[] {
  const arrayBuf = toArrayBuffer(buffer);
  const pe = new PEReader(arrayBuf);
  const items: EgfResourceItem[] = [];

  for (const id of pe.getResourceIDs()) {
    const info = pe.getResourceInfo(id);
    if (info) {
      items.push({
        id,
        width: info.width,
        height: info.height,
        size: info.size,
      });
    }
  }

  items.sort((a, b) => a.id - b.id);
  return items;
}

/**
 * Extracts and decodes a bitmap resource by its numeric ID from an EGF archive.
 */
export function extractEgfBitmap(
  buffer: ArrayBuffer | Uint8Array,
  resourceId: number,
  fileId = 0,
): EgfExtractionResult {
  const arrayBuf = toArrayBuffer(buffer);
  const pe = new PEReader(arrayBuf);
  const info = pe.getResourceInfo(resourceId);

  if (!info) {
    throw new Error(`Resource ${resourceId} not found in EGF archive.`);
  }

  const rawDIB = pe.readResource(info);
  const dibReader = new DIBReader(rawDIB, fileId);
  const rgba = dibReader.read();
  const bmp = encodeBmp(dibReader.width, dibReader.height, rgba);

  return {
    resourceId,
    width: dibReader.width,
    height: Math.abs(dibReader.height),
    rgba,
    bmp,
  };
}
