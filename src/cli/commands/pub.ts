import fs from 'node:fs';
import { Command } from 'commander';
import {
  detectPubType,
  jsonToPub,
  pubToJson,
  type PubType,
  queryPub,
  readPub,
} from '../../core/pub.js';

export function makePubCommand(): Command {
  const cmd = new Command('pub').description('Inspect, query, and convert Endless Online pub files (.eif, .enf, .esf, .ecf)');

  cmd
    .command('inspect')
    .argument('<file>', 'Path to pub file')
    .option('-t, --type <type>', 'Pub type: eif, enf, esf, or ecf (auto-detected if omitted)')
    .option('--id <number>', 'Filter by record ID')
    .option('-s, --search <term>', 'Search by record name')
    .option('-l, --limit <number>', 'Max number of results to display', '25')
    .option('--offset <number>', 'Result offset', '0')
    .option('--json', 'Output as JSON')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const buf = fs.readFileSync(file);
      const uint8 = new Uint8Array(buf);
      const type = (options.type as PubType) || detectPubType(file) || detectPubType(uint8);

      if (!type) {
        console.error('Error: Could not determine pub type. Please specify --type <eif|enf|esf|ecf>');
        process.exit(1);
      }

      const pubData = readPub(type, uint8);
      const queryResult = queryPub(type, pubData, {
        id: options.id !== undefined ? parseInt(options.id, 10) : undefined,
        search: options.search,
        limit: parseInt(options.limit, 10),
        offset: parseInt(options.offset, 10),
      });

      if (options.json) {
        console.log(JSON.stringify(queryResult, null, 2));
      } else {
        console.log(`=== Pub Query: ${file} (Type: ${type.toUpperCase()}, Total: ${queryResult.total}) ===`);
        for (const item of queryResult.results) {
          if (type === 'eif') {
            console.log(`[Item #${item.id}] ${item.name} | Type: ${item.type} (${item.subtype}) | HP: ${item.hp}, TP: ${item.tp}, Dam: ${item.minDamage}-${item.maxDamage}, Weight: ${item.weight}`);
          } else if (type === 'enf') {
            console.log(`[NPC #${item.id}] ${item.name} | Graphic: ${item.graphicId} | HP: ${item.hp}, EXP: ${item.experience}, Dam: ${item.minDamage}-${item.maxDamage}, Type: ${item.type}`);
          } else if (type === 'esf') {
            console.log(`[Spell #${item.id}] ${item.name} (Chant: "${item.chant}") | TP: ${item.tpCost}, SP: ${item.spCost}, Type: ${item.type}`);
          } else if (type === 'ecf') {
            console.log(`[Class #${item.id}] ${item.name} | Parent: ${item.parentType}`);
          }
        }
        if (queryResult.total > queryResult.results.length) {
          console.log(`... showing ${queryResult.results.length} of ${queryResult.total} matches. Use --limit or --offset for more.`);
        }
      }
    });

  cmd
    .command('to-json')
    .argument('<file>', 'Path to pub file')
    .option('-t, --type <type>', 'Pub type: eif, enf, esf, or ecf (auto-detected if omitted)')
    .option('-o, --output <file>', 'Output JSON file path')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }
      const buf = fs.readFileSync(file);
      const uint8 = new Uint8Array(buf);
      const type = (options.type as PubType) || detectPubType(file) || detectPubType(uint8);

      if (!type) {
        console.error('Error: Could not determine pub type. Please specify --type <eif|enf|esf|ecf>');
        process.exit(1);
      }

      const json = pubToJson(type, uint8);
      if (options.output) {
        fs.writeFileSync(options.output, json, 'utf-8');
        console.log(`Exported ${type.toUpperCase()} JSON to ${options.output}`);
      } else {
        console.log(json);
      }
    });

  cmd
    .command('from-json')
    .argument('<file>', 'Path to JSON file')
    .requiredOption('-t, --type <type>', 'Pub type: eif, enf, esf, or ecf')
    .requiredOption('-o, --output <file>', 'Output pub file path')
    .option('--no-rid', 'Do not recalculate CRC32 RID checksum')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }
      const type = options.type.toLowerCase() as PubType;
      const jsonStr = fs.readFileSync(file, 'utf-8');
      const bytes = jsonToPub(type, jsonStr, options.rid !== false);
      fs.writeFileSync(options.output, bytes);
      console.log(`Compiled ${type.toUpperCase()} pub to ${options.output} (${bytes.length} bytes)`);
    });

  return cmd;
}
