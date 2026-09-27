import { DIBReader } from './dib-reader.js';
import { PEReader, type ResourceInfo } from './pe-reader.js';
import { encodeBmp } from './bmp-writer.js';

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
