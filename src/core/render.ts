import fs from 'node:fs';
import path from 'node:path';
import { extractEgfBitmap } from './egf/egf.js';
import { LAYER_GFX_FILE, readMap } from './map.js';
import { encodePng } from './png.js';

const TILE_W = 64;
const TILE_H = 32;
const HALF_W = TILE_W >> 1;
const HALF_H = TILE_H >> 1;

export interface MapPreviewOptions {
  /** Directory containing gfxNNN.egf files (e.g. gfx003.egf … gfx022.egf). */
  gfxDir: string;
  /** Output scale factor (0.5 = half size). Default 1. */
  scale?: number;
}

export interface MapPreviewMissing {
  layer: number;
  gfxFile: number;
  graphicId: number;
}

export interface MapPreviewResult {
  png: Buffer;
  width: number;
  height: number;
  tilesDrawn: number;
  tilesMissing: number;
  missing: MapPreviewMissing[];
}

interface Bitmap {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
}

/**
 * Per-layer sprite anchor offset. Mirrors eoweb MapRenderer.getOffset
 * (src/map.ts). Layer indices: 0 Ground, 1 Objects, 2 Overlay, 3 DownWall,
 * 4 RightWall, 5 Roof, 6 Top, 7 Shadow, 8 Overlay2.
 */
function layerOffset(layer: number, w: number, h: number): { x: number; y: number } {
  if (layer === 7) return { x: -24, y: -12 };
  if (layer === 1 || layer === 2 || layer === 8) {
    return { x: -2 - w / 2 + HALF_W, y: -2 - h + TILE_H };
  }
  if (layer === 3) return { x: 0, y: -1 - (h - TILE_H) };
  if (layer === 4) return { x: HALF_W, y: -1 - (h - TILE_H) };
  if (layer === 5) return { x: 0, y: -TILE_W };
  if (layer === 6) return { x: 0, y: -TILE_H };
  return { x: 0, y: 0 };
}

/**
 * Renders an .emf map to a PNG image using the same tile mapping eoweb uses:
 * isometric 64x32 tiles, per-layer gfx files and anchor offsets, animation
 * frame 0 for animated tiles, shadows at 20% alpha. Static tiles only
 * (no NPCs, items, or characters).
 */
export function renderMapPreview(mapFile: string, opts: MapPreviewOptions): MapPreviewResult {
  const scale = opts.scale ?? 1;
  if (!(scale > 0)) throw new Error(`Invalid scale: ${opts.scale}`);

  const neededFiles = [...new Set(LAYER_GFX_FILE)];
  const absent = neededFiles.filter(
    (f) => !fs.existsSync(path.join(opts.gfxDir, `gfx${String(f).padStart(3, '0')}.egf`)),
  );
  if (absent.length > 0) {
    throw new Error(`Missing gfx files in ${opts.gfxDir}: ${absent.map((f) => `gfx${String(f).padStart(3, '0')}.egf`).join(', ')}`);
  }

  const map = readMap(new Uint8Array(fs.readFileSync(mapFile)));
  const mapW = map.width;
  const mapH = map.height;

  // Per-layer tile lookup: "x,y" -> graphic id.
  const layerTiles: Map<string, number>[] = [];
  for (let li = 0; li < 9; li++) {
    const lookup = new Map<string, number>();
    const layer = map.graphicLayers?.[li];
    for (const row of layer?.graphicRows || []) {
      for (const tile of row.tiles || []) {
        lookup.set(`${tile.x},${row.y}`, tile.graphic);
      }
    }
    layerTiles.push(lookup);
  }

  const gfxBufs = new Map<number, Buffer>();
  const bmpCache = new Map<string, Bitmap | null>();
  const missing: MapPreviewMissing[] = [];
  const seenMissing = new Set<string>();

  function getBitmap(gfxFile: number, graphicId: number, layer: number): Bitmap | null {
    // EGF resource IDs are offset by +100 from map graphic IDs — the same
    // convention eoweb (atlas loadResource id+100) and eomap-js
    // (resourceID = gfx + 100) use.
    const resourceId = graphicId + 100;
    const key = `${gfxFile}:${resourceId}`;
    const cached = bmpCache.get(key);
    if (cached !== undefined) return cached;
    let bmp: Bitmap | null = null;
    try {
      let buf = gfxBufs.get(gfxFile);
      if (!buf) {
        buf = fs.readFileSync(path.join(opts.gfxDir, `gfx${String(gfxFile).padStart(3, '0')}.egf`));
        gfxBufs.set(gfxFile, buf);
      }
      const ex = extractEgfBitmap(buf, resourceId, gfxFile);
      bmp = { w: ex.width, h: Math.abs(ex.height), rgba: ex.rgba };
    } catch {
      bmp = null;
      if (!seenMissing.has(key)) {
        seenMissing.add(key);
        missing.push({ layer, gfxFile, graphicId });
      }
    }
    bmpCache.set(key, bmp);
    return bmp;
  }

  interface Op {
    dx: number;
    dy: number;
    bmp: Bitmap;
    cropW: number;
    cropH: number;
    alpha: number;
  }
  const ops: Op[] = [];
  let tilesMissing = 0;

  // Painter's order: diagonals of constant x+y outward, layers in order —
  // approximates eoweb's depth sorting for static tiles.
  for (let s = 0; s <= mapW + mapH - 2; s++) {
    for (let x = 0; x < mapW; x++) {
      const y = s - x;
      if (y < 0 || y >= mapH) continue;
      for (let li = 0; li < 9; li++) {
        const gfxFile = LAYER_GFX_FILE[li] as number;
        let gid = (layerTiles[li] as Map<string, number>).get(`${x},${y}`);
        if (gid === undefined) {
          if (li !== 0) continue;
          gid = map.fillTile;
        }
        const bmp = getBitmap(gfxFile, gid, li);
        if (!bmp) {
          tilesMissing++;
          continue;
        }
        // Animated strips: ground frames are TILE_W wide, wall frames w/4 (eoweb renderTile).
        let cropW = bmp.w;
        let cropH = bmp.h;
        if (li === 0 && bmp.w > TILE_W) {
          cropW = TILE_W;
          cropH = Math.min(bmp.h, TILE_H);
        } else if ((li === 3 || li === 4) && bmp.w > 120) {
          cropW = Math.floor(bmp.w / 4);
        }
        const off = layerOffset(li, cropW, bmp.h);
        ops.push({
          dx: Math.floor((x - y) * HALF_W - HALF_W + off.x),
          dy: Math.floor((x + y) * HALF_H - HALF_H + off.y),
          bmp,
          cropW,
          cropH,
          alpha: li === 7 ? 0.2 : 1,
        });
      }
    }
  }

  // Exact canvas bounds from placed sprites.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of ops) {
    if (op.dx < minX) minX = op.dx;
    if (op.dy < minY) minY = op.dy;
    if (op.dx + op.cropW > maxX) maxX = op.dx + op.cropW;
    if (op.dy + op.cropH > maxY) maxY = op.dy + op.cropH;
  }
  if (ops.length === 0) throw new Error('Nothing to render: no tiles resolved from gfx files.');

  const PAD = 8;
  const fullW = Math.ceil(maxX - minX + PAD * 2);
  const fullH = Math.ceil(maxY - minY + PAD * 2);
  const canvas = new Uint8ClampedArray(fullW * fullH * 4);
  // Opaque black background, like the EO client.
  for (let i = 0; i < canvas.length; i += 4) {
    canvas[i] = 0;
    canvas[i + 1] = 0;
    canvas[i + 2] = 0;
    canvas[i + 3] = 255;
  }

  let tilesDrawn = 0;
  for (const op of ops) {
    const ox = Math.round(op.dx - minX + PAD);
    const oy = Math.round(op.dy - minY + PAD);
    const src = op.bmp.rgba;
    const srcW = op.bmp.w;
    for (let sy = 0; sy < op.cropH; sy++) {
      const dy = oy + sy;
      if (dy < 0 || dy >= fullH) continue;
      for (let sx = 0; sx < op.cropW; sx++) {
        const dx = ox + sx;
        if (dx < 0 || dx >= fullW) continue;
        const si = (sy * srcW + sx) * 4;
        const sa = (src[si + 3] as number) / 255 * op.alpha;
        if (sa <= 0) continue;
        const di = (dy * fullW + dx) * 4;
        const inv = 1 - sa;
        canvas[di] = Math.round((src[si] as number) * sa + (canvas[di] as number) * inv);
        canvas[di + 1] = Math.round((src[si + 1] as number) * sa + (canvas[di + 1] as number) * inv);
        canvas[di + 2] = Math.round((src[si + 2] as number) * sa + (canvas[di + 2] as number) * inv);
        canvas[di + 3] = 255;
      }
    }
    tilesDrawn++;
  }

  // Nearest-neighbor scale (crisp pixels for AI inspection).
  let outW = fullW;
  let outH = fullH;
  let out: Uint8ClampedArray = canvas;
  if (scale !== 1) {
    outW = Math.max(1, Math.round(fullW * scale));
    outH = Math.max(1, Math.round(fullH * scale));
    out = new Uint8ClampedArray(outW * outH * 4);
    for (let y = 0; y < outH; y++) {
      const sy = Math.min(fullH - 1, Math.floor(y / scale));
      for (let x = 0; x < outW; x++) {
        const sx = Math.min(fullW - 1, Math.floor(x / scale));
        const si = (sy * fullW + sx) * 4;
        const di = (y * outW + x) * 4;
        out[di] = canvas[si] as number;
        out[di + 1] = canvas[si + 1] as number;
        out[di + 2] = canvas[si + 2] as number;
        out[di + 3] = canvas[si + 3] as number;
      }
    }
  }

  return { png: encodePng(outW, outH, out), width: outW, height: outH, tilesDrawn, tilesMissing, missing };
}
