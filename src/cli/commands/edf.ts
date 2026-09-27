import fs from 'node:fs';
import { Command } from 'commander';
import { decryptEdf, encryptEdf, extractFileIdFromPath } from '../../core/edf.js';

export function makeEdfCommand(): Command {
  const cmd = new Command('edf').description('Inspect, decrypt, and encrypt Endless Online .edf string files');

  cmd
    .command('decrypt')
    .argument('<file>', 'Path to .edf file to decrypt')
    .option('--id <number>', 'File ID (e.g. 3 for dat003.edf, 5 for dat005.edf). Auto-detected if omitted.')
    .option('-l, --line <number>', 'Print only a specific 0-based line index')
    .option('-o, --output <file>', 'Write decrypted output to file')
    .option('--json', 'Output as JSON array of lines')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const fileId = options.id !== undefined ? parseInt(options.id, 10) : extractFileIdFromPath(file);
      const raw = fs.readFileSync(file, 'utf-8');
      const lines = decryptEdf(raw, { fileId });

      if (options.line !== undefined) {
        const lineIdx = parseInt(options.line, 10);
        const line = lines[lineIdx] ?? '';
        if (options.json) {
          console.log(JSON.stringify({ file, lineIndex: lineIdx, text: line }, null, 2));
        } else {
          console.log(line);
        }
        return;
      }

      if (options.output) {
        if (options.json) {
          fs.writeFileSync(options.output, JSON.stringify(lines, null, 2), 'utf-8');
        } else {
          fs.writeFileSync(options.output, lines.join('\n') + '\n', 'utf-8');
        }
        console.log(`Decrypted ${lines.length} lines to ${options.output}`);
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(lines, null, 2));
      } else {
        lines.forEach((l, i) => console.log(`[${i}] ${l}`));
      }
    });

  cmd
    .command('encrypt')
    .argument('<file>', 'Path to plaintext input file (one line per record) or JSON array')
    .requiredOption('-o, --output <file>', 'Path to write encrypted .edf file')
    .option('--id <number>', 'File ID (e.g. 3 or 5). Auto-detected from output path if omitted.')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const fileId = options.id !== undefined ? parseInt(options.id, 10) : extractFileIdFromPath(options.output);
      const content = fs.readFileSync(file, 'utf-8');

      let lines: string[];
      if (file.endsWith('.json')) {
        lines = JSON.parse(content);
      } else {
        lines = content.split(/\r?\n/);
        // Remove trailing empty line if input had trailing newline
        if (lines.length > 0 && lines[lines.length - 1] === '') {
          lines.pop();
        }
      }

      const encrypted = encryptEdf(lines, { fileId });
      fs.writeFileSync(options.output, encrypted, 'utf-8');
      console.log(`Encrypted ${lines.length} lines to ${options.output} (fileId: ${fileId ?? 'default'})`);
    });

  return cmd;
}
