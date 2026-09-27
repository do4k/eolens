import { Ecf, Eif, Enf, EoReader, EoWriter, Esf } from 'eolib';
import { calculateRid } from './rid.js';

export type PubType = 'eif' | 'enf' | 'esf' | 'ecf';

export interface PubQueryResult {
  type: PubType;
  total: number;
  results: any[];
}

export interface PubQueryOptions {
  id?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Detects pub format type from file extension or signature.
 */
export function detectPubType(filePathOrBytes: string | Uint8Array): PubType | undefined {
  if (typeof filePathOrBytes === 'string') {
    const ext = filePathOrBytes.split('.').pop()?.toLowerCase();
    if (ext === 'eif' || ext === 'enf' || ext === 'esf' || ext === 'ecf') {
      return ext;
    }
  } else if (filePathOrBytes.length >= 3) {
    const sig = String.fromCharCode(filePathOrBytes[0], filePathOrBytes[1], filePathOrBytes[2]).toLowerCase();
    if (sig === 'eif' || sig === 'enf' || sig === 'esf' || sig === 'ecf') {
      return sig as PubType;
    }
  }
  return undefined;
}

/**
 * Deserializes an Endless Online pub file (EIF, ENF, ESF, ECF) into its structured object.
 */
export function readPub(type: PubType, buffer: Uint8Array): Eif | Enf | Esf | Ecf {
  const reader = new EoReader(buffer);
  switch (type) {
    case 'eif':
      return Eif.deserialize(reader);
    case 'enf':
      return Enf.deserialize(reader);
    case 'esf':
      return Esf.deserialize(reader);
    case 'ecf':
      return Ecf.deserialize(reader);
    default:
      throw new Error(`Unsupported pub type: ${type}`);
  }
}

/**
 * Serializes a pub object into its binary format, optionally updating its CRC32 RID checksum.
 */
export function writePub(type: PubType, data: any, options: { recalculateRid?: boolean } = { recalculateRid: true }): Uint8Array {
  const writer = new EoWriter();

  switch (type) {
    case 'eif':
      Eif.serialize(writer, data);
      break;
    case 'enf':
      Enf.serialize(writer, data);
      break;
    case 'esf':
      Esf.serialize(writer, data);
      break;
    case 'ecf':
      Ecf.serialize(writer, data);
      break;
    default:
      throw new Error(`Unsupported pub type: ${type}`);
  }

  let bytes = writer.toByteArray();

  if (options.recalculateRid) {
    const { charPair, shortPair } = calculateRid(bytes);
    if (type === 'eif') {
      data.rid = shortPair;
    } else {
      data.rid = charPair;
    }

    // Re-serialize with the updated RID
    const finalWriter = new EoWriter();
    switch (type) {
      case 'eif':
        Eif.serialize(finalWriter, data);
        break;
      case 'enf':
        Enf.serialize(finalWriter, data);
        break;
      case 'esf':
        Esf.serialize(finalWriter, data);
        break;
      case 'ecf':
        Ecf.serialize(finalWriter, data);
        break;
    }
    bytes = finalWriter.toByteArray();
  }

  return bytes;
}

export function cleanRecord(r: any, id?: number): any {
  if (!r) return null;
  const out: Record<string, any> = {};
  if (id !== undefined) {
    out.id = id;
  } else if (r.id !== undefined) {
    out.id = r.id;
  }
  for (const key of Object.keys(r)) {
    const cleanKey = key.startsWith('_') ? key.slice(1) : key;
    out[cleanKey] = r[cleanKey] !== undefined ? r[cleanKey] : r[key];
  }
  return out;
}

/**
 * Filters records within a pub file for token-efficient querying by AI or CLI.
 */
export function queryPub(type: PubType, pubData: any, options: PubQueryOptions = {}): PubQueryResult {
  let rawRecords: any[] = [];
  switch (type) {
    case 'eif':
      rawRecords = pubData.items || [];
      break;
    case 'enf':
      rawRecords = pubData.npcs || [];
      break;
    case 'esf':
      rawRecords = pubData.skills || [];
      break;
    case 'ecf':
      rawRecords = pubData.classes || [];
      break;
  }

  const records: any[] = [];
  for (let idx = 0; idx < rawRecords.length; idx++) {
    const r = rawRecords[idx];
    if (r) {
      // Pub record IDs are 1-based in game (file position + 1); the same
      // convention Acorn uses (EnfExtension.GetNpc: index = id - 1) and that
      // map spawn entries reference.
      r.id = idx + 1;
      records.push(r);
    }
  }

  let filtered = records;

  if (options.id !== undefined) {
    filtered = filtered.filter((r) => r.id === options.id);
  }

  if (options.search) {
    const q = options.search.toLowerCase();
    filtered = filtered.filter((r) => r.name && r.name.toLowerCase().includes(q));
  }

  const offset = options.offset || 0;
  const limit = options.limit !== undefined ? options.limit : (options.id !== undefined ? 1 : 25);
  const sliced = filtered.slice(offset, offset + limit).map((r) => cleanRecord(r, r.id));

  return {
    type,
    total: filtered.length,
    results: sliced,
  };
}

/**
 * Converts a pub file buffer directly into JSON.
 */
export function pubToJson(type: PubType, buffer: Uint8Array, pretty = true): string {
  const data = readPub(type, buffer);
  return JSON.stringify(data, null, pretty ? 2 : 0);
}

/**
 * Parses JSON and compiles it back into an Endless Online pub binary.
 */
export function jsonToPub(type: PubType, jsonStr: string, recalculateRid = true): Uint8Array {
  const parsed = JSON.parse(jsonStr);
  return writePub(type, parsed, { recalculateRid });
}
