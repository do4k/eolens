import zlib from 'node:zlib';
import { EoReader, EoWriter } from 'eolib';

export interface RidCalculation {
  crc32: number;
  encodedBytes: Uint8Array;
  charPair: [number, number];
  shortPair: [number, number];
}

/**
 * Calculates the Endless Online RID (Resource ID / Checksum) for a serialized binary file.
 * The checksum is a CRC32 of all bytes starting at offset 7 (after the 3-byte signature and 4-byte RID).
 * The resulting uint32 is encoded into 4 base-253 EO bytes.
 */
export function calculateRid(bytes: Uint8Array): RidCalculation {
  const payload = Buffer.from(bytes.buffer, bytes.byteOffset + 7, bytes.byteLength - 7);
  const checksum = zlib.crc32(payload);

  const b0 = (checksum % 253) + 1;
  const b1 = (Math.floor(checksum / 253) % 253) + 1;
  const b2 = (Math.floor(checksum / 64009) % 253) + 1;
  const b3 = (Math.floor(checksum / 16194277) % 253) + 1;

  const encodedBytes = new Uint8Array([b0, b1, b2, b3]);

  // Read as 2 chars (for EMF, ENF, ESF, ECF)
  const charReader1 = new EoReader(encodedBytes.subarray(0, 2));
  const charReader2 = new EoReader(encodedBytes.subarray(2, 4));
  const charPair: [number, number] = [charReader1.getChar(), charReader2.getChar()];

  // For EIF: in Heartwood/EO it is encoded using shorts from the raw uint32
  const shortWriter = new EoWriter();
  shortWriter.addShort(checksum & 0xffff);
  shortWriter.addShort((checksum >>> 16) & 0xffff);
  const shortEncoded = shortWriter.toByteArray();

  const shortReader1 = new EoReader(shortEncoded.subarray(0, 2));
  const shortReader2 = new EoReader(shortEncoded.subarray(2, 4));
  const shortPair: [number, number] = [shortReader1.getShort(), shortReader2.getShort()];

  return {
    crc32: checksum,
    encodedBytes,
    charPair,
    shortPair,
  };
}
