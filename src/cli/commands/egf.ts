import fs from 'node:fs';
import { Command } from 'commander';
import { extractEgfBitmap, listEgfResources } from '../../core/egf/egf.js';

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
    .option('-o, --output <file>', 'Output .bmp file path (defaults to <id>.bmp)')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const resourceId = parseInt(options.id, 10);
      const buf = fs.readFileSync(file);
      const outPath = options.output || `${resourceId}.bmp`;

      try {
        const result = extractEgfBitmap(buf, resourceId);
        fs.writeFileSync(outPath, result.bmp);
        console.log(`Extracted resource #${resourceId} (${result.width}x${result.height}) to ${outPath} (${result.bmp.length} bytes)`);
      } catch (err: any) {
        console.error(`Error extracting resource #${resourceId}:`, err.message);
        process.exit(1);
      }
    });

  return cmd;
}
