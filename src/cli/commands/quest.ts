import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { getQuestSummary, parseQuest, questToJson, readQuestFile } from '../../core/quest.js';

export function makeQuestCommand(): Command {
  const cmd = new Command('quest').description('Inspect and convert Endless Online EO+ quest files (.eqf / .txt)');

  cmd
    .command('inspect')
    .argument('<file>', 'Path to .eqf or .txt quest file')
    .option('--json', 'Output summary as JSON')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const quest = readQuestFile(file);
      if (!quest) {
        console.error(`Error: Could not parse quest file (no Main block or states): ${file}`);
        process.exit(1);
      }

      const summary = getQuestSummary(quest);
      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(`=== Quest Summary: ${file} ===`);
        console.log(`ID:       ${summary.id ?? '(unknown)'}`);
        console.log(`Name:     ${summary.name}`);
        console.log(`Version:  ${summary.version}`);
        console.log(`Counts:   ${summary.counts.totalStates} states, ${summary.counts.totalActions} actions, ${summary.counts.totalRules} rules`);
        console.log(`\nStates (${summary.states.length}):`);
        for (const s of summary.states) {
          console.log(`  ${s.name}${s.description ? ` — "${s.description}"` : ''} (${s.actions.length} actions, ${s.rules.length} rules)`);
        }
      }
    });

  cmd
    .command('states')
    .argument('<file>', 'Path to .eqf or .txt quest file')
    .option('--json', 'Output as JSON')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      const quest = readQuestFile(file);
      if (!quest) {
        console.error(`Error: Could not parse quest file (no Main block or states): ${file}`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(quest.states, null, 2));
      } else {
        for (const s of quest.states) {
          console.log(`\n[State ${s.name}]${s.description ? ` "${s.description}"` : ''}`);
          for (const a of s.actions) {
            const args = a.args.map((arg) => (arg.kind === 'str' ? `"${arg.value}"` : String(arg.value))).join(', ');
            console.log(`  action ${a.name}(${args})`);
          }
          for (const r of s.rules) {
            const args = r.args.map((arg) => (arg.kind === 'str' ? `"${arg.value}"` : String(arg.value))).join(', ');
            console.log(`  rule ${r.name}(${args}) goto ${r.goto}`);
          }
        }
      }
    });

  cmd
    .command('list')
    .argument('<dir>', 'Directory of .eqf / .txt quest files (like Acorn Data/quests)')
    .option('--json', 'Output as JSON')
    .action((dir, options) => {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        console.error(`Error: Directory not found: ${dir}`);
        process.exit(1);
      }

      const files = fs
        .readdirSync(dir)
        .filter((f) => /\.(eqf|txt)$/i.test(f))
        .sort();
      const rows = files.map((f) => {
        const full = path.join(dir, f);
        try {
          const quest = readQuestFile(full);
          return {
            file: f,
            id: quest?.id ?? null,
            name: quest?.name ?? null,
            version: quest?.version ?? null,
            states: quest?.states.length ?? 0,
            ok: quest !== null,
          };
        } catch (err: any) {
          return { file: f, id: null, name: null, version: null, states: 0, ok: false, error: err?.message ?? String(err) };
        }
      });

      if (options.json) {
        console.log(JSON.stringify(rows, null, 2));
      } else {
        console.log(`Quests in ${dir} (${rows.length} files):`);
        for (const r of rows) {
          if (r.ok) {
            console.log(`  ${r.file} — ID ${r.id}: "${r.name}" v${r.version} (${r.states} states)`);
          } else {
            console.log(`  ${r.file} — FAILED TO PARSE${r.error ? `: ${r.error}` : ''}`);
          }
        }
      }
    });

  cmd
    .command('to-json')
    .argument('<file>', 'Path to .eqf or .txt quest file')
    .option('-o, --output <file>', 'Output JSON file path')
    .action((file, options) => {
      if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }
      const quest = readQuestFile(file);
      if (!quest) {
        console.error(`Error: Could not parse quest file (no Main block or states): ${file}`);
        process.exit(1);
      }
      const json = questToJson(quest);
      if (options.output) {
        fs.writeFileSync(options.output, json, 'utf-8');
        console.log(`Exported quest JSON to ${options.output}`);
      } else {
        console.log(json);
      }
    });

  return cmd;
}

// Re-export for tests / library use without pulling in commander.
export { parseQuest };
