import { deinterleave, interleave, swapMultiples } from 'eolib';

export interface EdfDecryptOptions {
  /**
   * The file ID (e.g. 3 for dat003.edf).
   * File ID 3 only uses deinterleave without swapMultiples.
   * File ID 1 is typically plaintext credits.
   */
  fileId?: number;
  /**
   * Skip swapMultiples even if fileId !== 3.
   */
  skipSwapMultiples?: boolean;
}

export interface EdfEncryptOptions {
  fileId?: number;
  skipSwapMultiples?: boolean;
}

/**
 * Extracts a file ID from filename pattern like 'dat005.edf' or '5.edf'.
 */
export function extractFileIdFromPath(filePath: string): number | undefined {
  const match = filePath.match(/(?:dat)?(\d+)\.edf$/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Decrypts a single line of an EDF string.
 */
export function decryptEdfLine(line: string, options: EdfDecryptOptions = {}): string {
  if (!line || line.length === 0) return '';
  const buf = Buffer.from(line, 'utf-8');

  // Dat001 is traditionally plaintext credits
  if (options.fileId === 1) {
    return line;
  }

  deinterleave(buf);

  const shouldSwap = options.fileId !== 3 && !options.skipSwapMultiples;
  if (shouldSwap) {
    swapMultiples(buf, 7);
  }

  return buf.toString('utf-8');
}

/**
 * Encrypts a single plaintext line into EDF format.
 */
export function encryptEdfLine(line: string, options: EdfEncryptOptions = {}): string {
  if (!line || line.length === 0) return '';
  const buf = Buffer.from(line, 'utf-8');

  if (options.fileId === 1) {
    return line;
  }

  const shouldSwap = options.fileId !== 3 && !options.skipSwapMultiples;
  if (shouldSwap) {
    swapMultiples(buf, 7);
  }

  interleave(buf);
  return buf.toString('utf-8');
}

/**
 * Decrypts the raw contents of an EDF file into an array of string lines.
 */
export function decryptEdf(contentOrBuffer: string | Uint8Array, options: EdfDecryptOptions = {}): string[] {
  const rawText = typeof contentOrBuffer === 'string'
    ? contentOrBuffer
    : new TextDecoder('utf-8').decode(contentOrBuffer);

  const lines = rawText.split(/\r?\n/);
  return lines.map((line) => decryptEdfLine(line, options));
}

/**
 * Encrypts an array of plaintext lines into an EDF formatted string / bytes.
 */
export function encryptEdf(lines: string[], options: EdfEncryptOptions = {}): string {
  const encryptedLines = lines.map((line) => encryptEdfLine(line, options));
  return encryptedLines.join('\r\n') + '\r\n';
}
