#!/usr/bin/env node
import { Command } from 'commander';
import { makeEdfCommand } from './commands/edf.js';
import { makeMapCommand } from './commands/map.js';
import { makePubCommand } from './commands/pub.js';
import { makeEgfCommand } from './commands/egf.js';
import { runMcpServer } from '../mcp/index.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('eolens')
    .description('Lens of Truth: CLI and MCP server for Endless Online game files (.edf, .emf, .pub, .egf)')
    .version('0.1.0');

  program.addCommand(makeEdfCommand());
  program.addCommand(makeMapCommand());
  program.addCommand(makePubCommand());
  program.addCommand(makeEgfCommand());

  program
    .command('mcp')
    .description('Start the Model Context Protocol (MCP) stdio server for AI agents')
    .action(async () => {
      await runMcpServer();
    });

  return program;
}

if (process.argv[1]?.endsWith('eolens.js') || process.argv[1]?.endsWith('cli/index.ts') || process.argv[1]?.endsWith('bin/eolens.js')) {
  createProgram().parse(process.argv);
}
