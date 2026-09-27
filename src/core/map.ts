import { Emf, EoReader, EoWriter, MapTileSpec } from 'eolib';
import { calculateRid } from './rid.js';

/**
 * Map layer index -> gfxNNN.egf file. Shared by the renderer and the tile
 * census (mirrors eoweb LAYER_GFX_MAP): Ground, Objects, Overlay, DownWall,
 * RightWall, Roof, Top, Shadow, Overlay2.
 */
export const LAYER_GFX_FILE = [3, 4, 5, 6, 6, 7, 3, 22, 5];

export interface MapWarpSummary {
  fromX: number;
  fromY: number;
  destinationMap: number;
  destinationX: number;
  destinationY: number;
  levelRequired: number;
  door: number;
}

export interface MapNpcSummary {
  id: number;
  x: number;
  y: number;
  amount: number;
  spawnTime: number;
  spawnType: number;
}

export interface MapSummary {
  name: string;
  dimensions: { width: number; height: number };
  fillTile: number;
  type: number;
  musicId: number;
  ambientSoundId: number;
  relogCoords: { x: number; y: number };
  rid: [number, number];
  counts: {
    totalNpcs: number;
    uniqueNpcIds: number[];
    totalWarps: number;
    totalChests: number;
    totalSigns: number;
  };
  warps: MapWarpSummary[];
  npcs: MapNpcSummary[];
}

export interface MapTileInspection {
  x: number;
  y: number;
  tileSpec: MapTileSpec | number | null;
  tileSpecName: string;
  graphics: { layer: number; graphicId: number }[];
  warp: MapWarpSummary | null;
}

const TILE_SPEC_NAMES: Record<number, string> = {
  [MapTileSpec.Wall]: 'Wall',
  [MapTileSpec.ChairDown]: 'ChairDown',
  [MapTileSpec.ChairLeft]: 'ChairLeft',
  [MapTileSpec.ChairRight]: 'ChairRight',
  [MapTileSpec.ChairUp]: 'ChairUp',
  [MapTileSpec.ChairDownRight]: 'ChairDownRight',
  [MapTileSpec.ChairUpLeft]: 'ChairUpLeft',
  [MapTileSpec.ChairAll]: 'ChairAll',
  [MapTileSpec.Chest]: 'Chest',
  [MapTileSpec.BankVault]: 'BankVault',
  [MapTileSpec.NpcBoundary]: 'NpcBoundary',
  [MapTileSpec.Edge]: 'Edge',
  [MapTileSpec.FakeWall]: 'FakeWall',
  [MapTileSpec.Board1]: 'Board1',
  [MapTileSpec.Board2]: 'Board2',
  [MapTileSpec.Board3]: 'Board3',
  [MapTileSpec.Board4]: 'Board4',
  [MapTileSpec.Board5]: 'Board5',
  [MapTileSpec.Board6]: 'Board6',
  [MapTileSpec.Board7]: 'Board7',
  [MapTileSpec.Board8]: 'Board8',
  [MapTileSpec.Jukebox]: 'Jukebox',
  [MapTileSpec.Jump]: 'Jump',
  [MapTileSpec.Water]: 'Water',
  [MapTileSpec.Arena]: 'Arena',
  [MapTileSpec.AmbientSource]: 'AmbientSource',
  [MapTileSpec.TimedSpikes]: 'TimedSpikes',
  [MapTileSpec.Spikes]: 'Spikes',
  [MapTileSpec.HiddenSpikes]: 'HiddenSpikes',
};

/**
 * Reads an EMF buffer into an Emf object.
 */
export function readMap(buffer: Uint8Array): Emf {
  const reader = new EoReader(buffer);
  return Emf.deserialize(reader);
}

/**
 * Serializes an Emf object to binary bytes, optionally recalculating the CRC32 RID checksum.
 */
export function writeMap(map: Emf, options: { recalculateRid?: boolean } = { recalculateRid: true }): Uint8Array {
  const writer = new EoWriter();
  Emf.serialize(writer, map);
  let bytes = writer.toByteArray();

  if (options.recalculateRid) {
    const { charPair } = calculateRid(bytes);
    map.rid = charPair;

    const finalWriter = new EoWriter();
    Emf.serialize(finalWriter, map);
    bytes = finalWriter.toByteArray();
  }

  return bytes;
}

/**
 * Returns a token-efficient summary of the map (ideal for AI consumption).
 */
export function getMapSummary(map: Emf): MapSummary {
  const warps: MapWarpSummary[] = [];
  for (const row of map.warpRows || []) {
    for (const tile of row.tiles || []) {
      if (tile.warp) {
        warps.push({
          fromX: tile.x,
          fromY: row.y,
          destinationMap: tile.warp.destinationMap,
          destinationX: tile.warp.destinationCoords.x,
          destinationY: tile.warp.destinationCoords.y,
          levelRequired: tile.warp.levelRequired,
          door: tile.warp.door,
        });
      }
    }
  }

  const npcs: MapNpcSummary[] = [];
  const uniqueNpcIds = new Set<number>();
  for (const npc of map.npcs || []) {
    uniqueNpcIds.add(npc.id);
    npcs.push({
      id: npc.id,
      x: npc.coords.x,
      y: npc.coords.y,
      amount: npc.amount,
      spawnTime: npc.spawnTime,
      spawnType: npc.spawnType,
    });
  }

  return {
    name: map.name,
    dimensions: { width: map.width, height: map.height },
    fillTile: map.fillTile,
    type: map.type,
    musicId: map.musicId,
    ambientSoundId: map.ambientSoundId,
    relogCoords: { x: map.relogX, y: map.relogY },
    rid: map.rid as [number, number],
    counts: {
      totalNpcs: npcs.length,
      uniqueNpcIds: Array.from(uniqueNpcIds).sort((a, b) => a - b),
      totalWarps: warps.length,
      totalChests: map.items?.length || 0,
      totalSigns: map.signs?.length || 0,
    },
    warps,
    npcs,
  };
}

/**
 * Inspects a single coordinate (x, y) on the map.
 */
export function inspectMapTile(map: Emf, x: number, y: number): MapTileInspection {
  let tileSpec: number | null = null;
  for (const row of map.tileSpecRows || []) {
    if (row.y === y) {
      for (const tile of row.tiles || []) {
        if (tile.x === x) {
          tileSpec = tile.tileSpec;
          break;
        }
      }
    }
  }

  const graphics: { layer: number; graphicId: number }[] = [];
  for (let layerIdx = 0; layerIdx < (map.graphicLayers?.length || 0); layerIdx++) {
    const layer = map.graphicLayers[layerIdx];
    for (const row of layer.graphicRows || []) {
      if (row.y === y) {
        for (const tile of row.tiles || []) {
          if (tile.x === x) {
            graphics.push({ layer: layerIdx, graphicId: tile.graphic });
          }
        }
      }
    }
  }

  let warp: MapWarpSummary | null = null;
  for (const row of map.warpRows || []) {
    if (row.y === y) {
      for (const tile of row.tiles || []) {
        if (tile.x === x && tile.warp) {
          warp = {
            fromX: x,
            fromY: y,
            destinationMap: tile.warp.destinationMap,
            destinationX: tile.warp.destinationCoords.x,
            destinationY: tile.warp.destinationCoords.y,
            levelRequired: tile.warp.levelRequired,
            door: tile.warp.door,
          };
          break;
        }
      }
    }
  }

  const tileSpecName = tileSpec !== null ? (TILE_SPEC_NAMES[tileSpec] || `Spec(${tileSpec})`) : 'Walkable (None)';

  return {
    x,
    y,
    tileSpec,
    tileSpecName,
    graphics,
    warp,
  };
}

/**
 * Converts an EMF file buffer into JSON.
 */
export function mapToJson(buffer: Uint8Array, pretty = true): string {
  const map = readMap(buffer);
  return JSON.stringify(map, null, pretty ? 2 : 0);
}

/**
 * Converts a JSON string back into an EMF binary buffer with recalculated RID.
 */
export function jsonToMap(jsonStr: string, recalculateRid = true): Uint8Array {
  const mapData = JSON.parse(jsonStr);
  return writeMap(mapData, { recalculateRid });
}

export interface MapTileCensusLayer {
  layer: number;
  gfxFile: number;
  /** Tiles with an explicit graphic (excludes fill-covered ground). */
  explicitTiles: number;
  uniqueGraphics: number;
  /** Graphic IDs by usage, descending. */
  tiles: { graphicId: number; count: number }[];
}

export interface MapTileCensus {
  name: string;
  dimensions: { width: number; height: number };
  fillTile: number;
  /** Ground tiles covered by the fill (no explicit graphic). */
  fillCoveredTiles: number;
  layers: MapTileCensusLayer[];
}

/**
 * Counts graphic-ID usage per layer — identifies which tiles dominate a map
 * (e.g. road networks) without dumping the full grid.
 */
export function getMapTileCensus(map: Emf): MapTileCensus {
  const layers: MapTileCensusLayer[] = [];
  let explicitGround = 0;
  for (let li = 0; li < (map.graphicLayers?.length || 0); li++) {
    const counts = new Map<number, number>();
    const layer = map.graphicLayers[li];
    for (const row of layer?.graphicRows || []) {
      for (const tile of row.tiles || []) {
        counts.set(tile.graphic, (counts.get(tile.graphic) || 0) + 1);
      }
    }
    if (li === 0) {
      for (const n of counts.values()) explicitGround += n;
    }
    layers.push({
      layer: li,
      gfxFile: LAYER_GFX_FILE[li] ?? -1,
      explicitTiles: [...counts.values()].reduce((a, b) => a + b, 0),
      uniqueGraphics: counts.size,
      tiles: [...counts.entries()]
        .map(([graphicId, count]) => ({ graphicId, count }))
        .sort((a, b) => b.count - a.count),
    });
  }

  return {
    name: map.name,
    dimensions: { width: map.width, height: map.height },
    fillTile: map.fillTile,
    fillCoveredTiles: map.width * map.height - explicitGround,
    layers,
  };
}
