import fs from 'node:fs';
import { Command } from 'commander';
import { extractEgfBitmap, listEgfResources, sheetEgfResources } from '../../core/egf/egf.js';
import { encodePng } from '../../core/png.js';

export function makeEgfCommand(): Command {
  const cmd = new Command('egf').description('Inspect and extract bitmaps from Endless Online .egf graphic archives');

  cmd
    .command('list')
    .argument('<file>', 'Path to .egf file')
    .option('--json', 'Output as JSON array')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const buf = fs.readFileSync(file);
      const items = listEgfResources(buf);

      if (options.json) {
        console.log(JSON.stringify(items, null, 2));
      } else {
        console.log(`=== Graphic Resources in ${file} (Total: ${items.length}) ===`);
        for (const it of items) {
          console.log(`  ID #${it.id.toString().padEnd(5)} | ${it.width}x${it.height} px | ${it.size} bytes`);
        }
      }
    });

  cmd
    .command('extract')
    .argument('<file>', 'Path to .egf file')
    .requiredOption('--id <number>', 'Resource ID to extract')
    .option('-o, --output <file>', 'Output file path (defaults to <id>.bmp; use .png extension for PNG output)')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const resourceId = parseInt(options.id, 10);
      const buf = fs.readFileSync(file);
      const outPath = options.output || `${resourceId}.bmp`;
      const asPng = outPath.toLowerCase().endsWith('.png');

      try {
        const result = extractEgfBitmap(buf, resourceId);
        const out = asPng ? encodePng(result.width, result.height, result.rgba) : result.bmp;
        fs.writeFileSync(outPath, out);
        console.log(`Extracted resource #${resourceId} (${result.width}x${result.height}) to ${outPath} (${out.length} bytes)`);
      } catch (err: any) {
        console.error(`Error extracting resource #${resourceId}:`, err.message);
        process.exit(1);
      }
    });

  cmd
    .command('sheet')
    .argument('<file>', 'Path to .egf file')
    .requiredOption('--ids <list>', 'Comma-separated resource IDs (e.g. 395,477,555)')
    .option('--columns <number>', 'Thumbnails per row', '8')
    .option('-o, --output <file>', 'Output PNG path (default: sheet.png)')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const ids = String(options.ids)
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      if (ids.length === 0) {
        console.error('Error: No valid resource IDs in --ids');
        process.exit(1);
      }

      const buf = fs.readFileSync(file);
      const outPath = options.output || 'sheet.png';
      const result = sheetEgfResources(buf, ids, 0, parseInt(options.columns, 10) || 8);
      fs.writeFileSync(outPath, result.png);
      console.log(`Wrote contact sheet ${result.width}x${result.height} (${result.extracted.length} tiles) to ${outPath}`);
      if (result.missing.length > 0) {
        console.log(`Missing resource IDs (left blank): ${result.missing.join(', ')}`);
      }
    });

  return cmd;
}
