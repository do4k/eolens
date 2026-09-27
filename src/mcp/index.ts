import fs from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { decryptEdf, encryptEdf, extractFileIdFromPath } from '../core/edf.js';
import {
  getMapSummary,
  inspectMapTile,
  jsonToMap,
  mapToJson,
  readMap,
} from '../core/map.js';
import {
  detectPubType,
  jsonToPub,
  pubToJson,
  type PubType,
  queryPub,
  readPub,
} from '../core/pub.js';
import { extractEgfBitmap, listEgfResources } from '../core/egf/egf.js';
import { getQuestSummary, questToJson, readQuestFile } from '../core/quest.js';

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'eolens',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'eolens_edf_decrypt',
          description:
            'Decrypt an Endless Online .edf string/dialog file (e.g. dat005.edf) into human-readable text.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Absolute or relative path to the .edf file' },
              fileId: { type: 'number', description: 'File ID (e.g. 3 or 5). Auto-detected from path if omitted.' },
              lineIndex: { type: 'number', description: 'Optional specific 0-based line index to retrieve' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'eolens_edf_encrypt',
          description:
            'Encrypt plaintext lines back into an Endless Online .edf format file.',
          inputSchema: {
            type: 'object',
            properties: {
              lines: { type: 'array', items: { type: 'string' }, description: 'Array of string lines to encrypt' },
              outPath: { type: 'string', description: 'Output path for the encrypted .edf file' },
              fileId: { type: 'number', description: 'File ID (e.g. 3 or 5). Auto-detected from outPath if omitted.' },
            },
            required: ['lines', 'outPath'],
          },
        },
        {
          name: 'eolens_map_summary',
          description:
            'Get a concise, token-efficient summary of an Endless Online .emf map (name, dimensions, NPC spawns, warps, chest counts) without dumping the full tile grid.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to .emf map file' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'eolens_map_inspect_tile',
          description:
            'Inspect a single tile coordinate (x, y) on an .emf map to view its wall/walkable spec, graphics layers, and warp target.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to .emf map file' },
              x: { type: 'number', description: 'Tile X coordinate' },
              y: { type: 'number', description: 'Tile Y coordinate' },
            },
            required: ['filePath', 'x', 'y'],
          },
        },
        {
          name: 'eolens_map_to_json',
          description:
            'Export a complete .emf map to JSON format.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to .emf map file' },
              outPath: { type: 'string', description: 'Optional file path to save JSON to' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'eolens_map_from_json',
          description:
            'Compile a JSON map back into binary .emf format with automatically recalculated CRC32 RID checksum.',
          inputSchema: {
            type: 'object',
            properties: {
              jsonPath: { type: 'string', description: 'Path to JSON map file' },
              outPath: { type: 'string', description: 'Output .emf binary path' },
            },
            required: ['jsonPath', 'outPath'],
          },
        },
        {
          name: 'eolens_pub_query',
          description:
            'Query records in an Endless Online pub file (.eif item, .enf npc, .esf spell, .ecf class) by name or ID.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to pub file' },
              type: {
                type: 'string',
                enum: ['eif', 'enf', 'esf', 'ecf'],
                description: 'Pub type (auto-detected if omitted)',
              },
              search: { type: 'string', description: 'Case-insensitive search term in record name' },
              id: { type: 'number', description: 'Exact record ID to find' },
              limit: { type: 'number', description: 'Max number of results to return (default: 25)' },
              offset: { type: 'number', description: 'Results offset for pagination' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'eolens_pub_to_json',
          description: 'Convert a pub file (.eif, .enf, .esf, .ecf) to JSON.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to pub file' },
              type: { type: 'string', enum: ['eif', 'enf', 'esf', 'ecf'] },
              outPath: { type: 'string', description: 'Optional output path for JSON' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'eolens_pub_from_json',
          description:
            'Compile a JSON file back into an Endless Online pub binary (.eif, .enf, .esf, .ecf) with recalculated CRC32 RID checksum.',
          inputSchema: {
            type: 'object',
            properties: {
              jsonPath: { type: 'string', description: 'Path to JSON file' },
              type: { type: 'string', enum: ['eif', 'enf', 'esf', 'ecf'], description: 'Pub format type' },
              outPath: { type: 'string', description: 'Output pub binary path' },
            },
            required: ['jsonPath', 'type', 'outPath'],
          },
        },
        {
          name: 'eolens_egf_list',
          description:
            'List all bitmap resource IDs, dimensions, and byte sizes inside an Endless Online .egf graphic archive.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to .egf file' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'eolens_egf_extract',
          description:
            'Extract and decode a bitmap resource from an .egf archive, saving it as a standard 32-bit BMP image.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to .egf file' },
              resourceId: { type: 'number', description: 'Resource ID to extract' },
              outPath: { type: 'string', description: 'Output .bmp file path' },
            },
            required: ['filePath', 'resourceId', 'outPath'],
          },
        },
        {
          name: 'eolens_quest_summary',
          description:
            'Parse an Endless Online EO+ quest file (.eqf / .txt, same format Acorn loads from Data/quests) and return a concise summary: quest name, version, state list with goals plus action/rule counts.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to .eqf or .txt quest file' },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'eolens_quest_to_json',
          description:
            'Parse an EO+ quest file (.eqf / .txt) into full JSON: all states with descriptions, actions and rules.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to .eqf or .txt quest file' },
              outPath: { type: 'string', description: 'Optional file path to save JSON to' },
            },
            required: ['filePath'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'eolens_edf_decrypt': {
          const filePath = String(args?.filePath);
          const raw = fs.readFileSync(filePath, 'utf-8');
          const fileId = args?.fileId !== undefined ? Number(args.fileId) : extractFileIdFromPath(filePath);
          const lines = decryptEdf(raw, { fileId });

          if (args?.lineIndex !== undefined) {
            const idx = Number(args.lineIndex);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ lineIndex: idx, text: lines[idx] ?? null }),
                },
              ],
            };
          }

          return {
            content: [{ type: 'text', text: JSON.stringify(lines, null, 2) }],
          };
        }

        case 'eolens_edf_encrypt': {
          const lines = args?.lines as string[];
          const outPath = String(args?.outPath);
          const fileId = args?.fileId !== undefined ? Number(args.fileId) : extractFileIdFromPath(outPath);
          const encrypted = encryptEdf(lines, { fileId });
          fs.writeFileSync(outPath, encrypted, 'utf-8');
          return {
            content: [
              {
                type: 'text',
                text: `Successfully encrypted ${lines.length} lines to ${outPath} (fileId: ${fileId ?? 'default'})`,
              },
            ],
          };
        }

        case 'eolens_map_summary': {
          const filePath = String(args?.filePath);
          const buf = fs.readFileSync(filePath);
          const map = readMap(new Uint8Array(buf));
          const summary = getMapSummary(map);
          return {
            content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
          };
        }

        case 'eolens_map_inspect_tile': {
          const filePath = String(args?.filePath);
          const x = Number(args?.x);
          const y = Number(args?.y);
          const buf = fs.readFileSync(filePath);
          const map = readMap(new Uint8Array(buf));
          const tile = inspectMapTile(map, x, y);
          return {
            content: [{ type: 'text', text: JSON.stringify(tile, null, 2) }],
          };
        }

        case 'eolens_map_to_json': {
          const filePath = String(args?.filePath);
          const buf = fs.readFileSync(filePath);
          const json = mapToJson(new Uint8Array(buf));
          if (args?.outPath) {
            fs.writeFileSync(String(args.outPath), json, 'utf-8');
            return {
              content: [{ type: 'text', text: `Map JSON exported to ${args.outPath}` }],
            };
          }
          return {
            content: [{ type: 'text', text: json }],
          };
        }

        case 'eolens_map_from_json': {
          const jsonPath = String(args?.jsonPath);
          const outPath = String(args?.outPath);
          const jsonStr = fs.readFileSync(jsonPath, 'utf-8');
          const bytes = jsonToMap(jsonStr, true);
          fs.writeFileSync(outPath, bytes);
          return {
            content: [{ type: 'text', text: `Compiled map to ${outPath} (${bytes.length} bytes)` }],
          };
        }

        case 'eolens_pub_query': {
          const filePath = String(args?.filePath);
          const buf = fs.readFileSync(filePath);
          const uint8 = new Uint8Array(buf);
          const type = (args?.type as PubType) || detectPubType(filePath) || detectPubType(uint8);
          if (!type) {
            throw new Error('Unable to determine pub type.');
          }
          const pubData = readPub(type, uint8);
          const result = queryPub(type, pubData, {
            id: args?.id !== undefined ? Number(args.id) : undefined,
            search: args?.search ? String(args.search) : undefined,
            limit: args?.limit !== undefined ? Number(args.limit) : 25,
            offset: args?.offset !== undefined ? Number(args.offset) : 0,
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'eolens_pub_to_json': {
          const filePath = String(args?.filePath);
          const buf = fs.readFileSync(filePath);
          const uint8 = new Uint8Array(buf);
          const type = (args?.type as PubType) || detectPubType(filePath) || detectPubType(uint8);
          if (!type) {
            throw new Error('Unable to determine pub type.');
          }
          const json = pubToJson(type, uint8);
          if (args?.outPath) {
            fs.writeFileSync(String(args.outPath), json, 'utf-8');
            return {
              content: [{ type: 'text', text: `Exported ${type.toUpperCase()} to ${args.outPath}` }],
            };
          }
          return {
            content: [{ type: 'text', text: json }],
          };
        }

        case 'eolens_pub_from_json': {
          const jsonPath = String(args?.jsonPath);
          const type = String(args?.type).toLowerCase() as PubType;
          const outPath = String(args?.outPath);
          const jsonStr = fs.readFileSync(jsonPath, 'utf-8');
          const bytes = jsonToPub(type, jsonStr, true);
          fs.writeFileSync(outPath, bytes);
          return {
            content: [
              {
                type: 'text',
                text: `Compiled ${type.toUpperCase()} pub to ${outPath} (${bytes.length} bytes)`,
              },
            ],
          };
        }

        case 'eolens_egf_list': {
          const filePath = String(args?.filePath);
          const buf = fs.readFileSync(filePath);
          const items = listEgfResources(buf);
          return {
            content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
          };
        }

        case 'eolens_egf_extract': {
          const filePath = String(args?.filePath);
          const resourceId = Number(args?.resourceId);
          const outPath = String(args?.outPath);
          const buf = fs.readFileSync(filePath);
          const result = extractEgfBitmap(buf, resourceId);
          fs.writeFileSync(outPath, result.bmp);
          return {
            content: [
              {
                type: 'text',
                text: `Extracted resource #${resourceId} (${result.width}x${result.height}) to ${outPath}`,
              },
            ],
          };
        }

        case 'eolens_quest_summary': {
          const filePath = String(args?.filePath);
          const quest = readQuestFile(filePath);
          if (!quest) {
            throw new Error(`Could not parse quest file (no Main block or states): ${filePath}`);
          }
          const summary = getQuestSummary(quest);
          return {
            content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
          };
        }

        case 'eolens_quest_to_json': {
          const filePath = String(args?.filePath);
          const quest = readQuestFile(filePath);
          if (!quest) {
            throw new Error(`Could not parse quest file (no Main block or states): ${filePath}`);
          }
          const json = questToJson(quest);
          if (args?.outPath) {
            fs.writeFileSync(String(args.outPath), json, 'utf-8');
            return {
              content: [{ type: 'text', text: `Exported quest JSON to ${args.outPath}` }],
            };
          }
          return {
            content: [{ type: 'text', text: json }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message || String(error) }],
      };
    }
  });

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('eolens MCP server running on stdio');
}
