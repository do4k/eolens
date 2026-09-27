import fs from 'node:fs';
import { Command } from 'commander';
import { getMapSummary, inspectMapTile, jsonToMap, mapToJson, readMap } from '../../core/map.js';

export function makeMapCommand(): Command {
  const cmd = new Command('map').description('Inspect, query, and convert Endless Online .emf map files');

  cmd
    .command('inspect')
    .argument('<file>', 'Path to .emf map file')
    .option('--json', 'Output summary as JSON')
    .option('--full', 'Output complete map object (warning: large payload)')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const buf = fs.readFileSync(file);
      const map = readMap(new Uint8Array(buf));

      if (options.full) {
        console.log(JSON.stringify(map, null, 2));
        return;
      }

      const summary = getMapSummary(map);
      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(`=== Map Summary: ${file} ===`);
        console.log(`Name:        ${summary.name || '(unnamed)'}`);
        console.log(`Dimensions:  ${summary.dimensions.width} x ${summary.dimensions.height}`);
        console.log(`Fill Tile:   ${summary.fillTile}`);
        console.log(`Type:        ${summary.type}`);
        console.log(`RID:         [${summary.rid.join(', ')}]`);
        console.log(`Relog:       (${summary.relogCoords.x}, ${summary.relogCoords.y})`);
        console.log(`Music / SFX: Music ${summary.musicId}, Ambient ${summary.ambientSoundId}`);
        console.log(`Counts:      ${summary.counts.totalNpcs} NPCs (${summary.counts.uniqueNpcIds.length} unique), ${summary.counts.totalWarps} Warps, ${summary.counts.totalChests} Chests, ${summary.counts.totalSigns} Signs`);
        if (summary.warps.length > 0) {
          console.log(`\nWarps (${summary.warps.length}):`);
          for (const w of summary.warps.slice(0, 10)) {
            console.log(`  (${w.fromX}, ${w.fromY}) -> Map ${w.destinationMap} (${w.destinationX}, ${w.destinationY})${w.door ? ` [Door: ${w.door}]` : ''}`);
          }
          if (summary.warps.length > 10) console.log(`  ... and ${summary.warps.length - 10} more warps`);
        }
        if (summary.npcs.length > 0) {
          console.log(`\nNPC Spawns (${summary.npcs.length}):`);
          for (const n of summary.npcs.slice(0, 10)) {
            console.log(`  NPC ID ${n.id} at (${n.x}, ${n.y}) x${n.amount} (spawn time: ${n.spawnTime}s, type: ${n.spawnType})`);
          }
          if (summary.npcs.length > 10) console.log(`  ... and ${summary.npcs.length - 10} more spawns`);
        }
      }
    });

  cmd
    .command('warps')
    .argument('<file>', 'Path to .emf map file')
    .option('--json', 'Output as JSON')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }
      const buf = fs.readFileSync(file);
      const map = readMap(new Uint8Array(buf));
      const summary = getMapSummary(map);

      if (options.json) {
        console.log(JSON.stringify(summary.warps, null, 2));
      } else {
        console.log(`Warps in ${file} (${summary.warps.length}):`);
        for (const w of summary.warps) {
          console.log(`  (${w.fromX}, ${w.fromY}) -> Map ${w.destinationMap} (${w.destinationX}, ${w.destinationY})${w.door ? ` [Door ${w.door}]` : ''}${w.levelRequired ? ` [Level ${w.levelRequired}]` : ''}`);
        }
      }
    });

  cmd
    .command('npcs')
    .argument('<file>', 'Path to .emf map file')
    .option('--json', 'Output as JSON')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }
      const buf = fs.readFileSync(file);
      const map = readMap(new Uint8Array(buf));
      const summary = getMapSummary(map);

      if (options.json) {
        console.log(JSON.stringify(summary.npcs, null, 2));
      } else {
        console.log(`NPC Spawns in ${file} (${summary.npcs.length}):`);
        for (const n of summary.npcs) {
          console.log(`  NPC ID ${n.id} at (${n.x}, ${n.y}) amount=${n.amount} spawnTime=${n.spawnTime}s type=${n.spawnType}`);
        }
      }
    });

  cmd
    .command('tile')
    .argument('<file>', 'Path to .emf map file')
    .requiredOption('-x, --x <number>', 'X coordinate')
    .requiredOption('-y, --y <number>', 'Y coordinate')
    .option('--json', 'Output as JSON')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }
      const x = parseInt(options.x, 10);
      const y = parseInt(options.y, 10);
      const buf = fs.readFileSync(file);
      const map = readMap(new Uint8Array(buf));
      const tile = inspectMapTile(map, x, y);

      if (options.json) {
        console.log(JSON.stringify(tile, null, 2));
      } else {
        console.log(`Tile at (${x}, ${y}):`);
        console.log(`  Spec:     ${tile.tileSpecName} (${tile.tileSpec ?? 'none'})`);
        console.log(`  Graphics: ${tile.graphics.length > 0 ? tile.graphics.map((g) => `Layer ${g.layer}: ID ${g.graphicId}`).join(', ') : 'None'}`);
        if (tile.warp) {
          console.log(`  Warp:     -> Map ${tile.warp.destinationMap} (${tile.warp.destinationX}, ${tile.warp.destinationY})`);
        }
      }
    });

  cmd
    .command('to-json')
    .argument('<file>', 'Path to .emf map file')
    .option('-o, --output <file>', 'Output JSON file path')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }
      const buf = fs.readFileSync(file);
      const json = mapToJson(new Uint8Array(buf));
      if (options.output) {
        fs.writeFileSync(options.output, json, 'utf-8');
        console.log(`Exported map JSON to ${options.output}`);
      } else {
        console.log(json);
      }
    });

  cmd
    .command('from-json')
    .argument('<file>', 'Path to JSON map file')
    .requiredOption('-o, --output <file>', 'Path to write .emf binary')
    .option('--no-rid', 'Do not recalculate CRC32 RID checksum')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }
      const jsonStr = fs.readFileSync(file, 'utf-8');
      const bytes = jsonToMap(jsonStr, options.rid !== false);
      fs.writeFileSync(options.output, bytes);
      console.log(`Compiled map to ${options.output} (${bytes.length} bytes)`);
    });

  return cmd;
}
