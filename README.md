# eolens

Lens of Truth for Endless Online game files — CLI and MCP server for inspecting, decrypting, and manipulating `.edf`, `.emf`, `.pub` (`.eif` / `.enf` / `.esf` / `.ecf`), `.egf`, and EO+ quest (`.eqf` / `.txt`) files.

Built on [eolib](https://www.npmjs.com/package/eolib), with a token-efficient MCP layer for AI agents.

## Features

- **EDF**: decrypt / encrypt dialog string files (`dat003.edf`, `dat005.edf`, …)
- **Map (.emf)**: summary, warps, NPCs, single-tile inspect, `to-json` / `from-json` with CRC32 RID recalculation, PNG `preview` rendered with the same tile mapping as eoweb
- **Pub (`.eif` item, `.enf` npc, `.esf` spell, `.ecf` class)**: query by id / name, `to-json` / `from-json`
- **EGF**: list graphic resources, extract to 32-bit BMP or PNG, render contact sheets of tiles
- **Quest (.eqf / .txt)**: parse EO+ quest scripts (same format Acorn loads from `Data/quests`), inspect states, list directories, export to JSON
- **MCP server**: 16 tools over stdio for AI agents (`eolens_map_summary`, `eolens_pub_query`, `eolens_quest_summary`, `eolens_map_preview`, etc.)
- **Library**: importable core (`src/core/*`) + full TypeScript types

## Installation

Requires Node 18+.

### CLI Installation

**Global install (recommended):**
```bash
npm install -g git+https://github.com/do4k/eolens.git
```
Then run from anywhere:
```bash
eolens --help
```

**From source:**
```bash
git clone https://github.com/do4k/eolens.git
cd eolens
pnpm install
pnpm build

# Link to PATH globally:
pnpm link --global
# or symlink directly:
ln -sf $(pwd)/bin/eolens.js ~/.local/bin/eolens

# Development mode (runs directly with tsx, no build step needed):
pnpm dev -- --help
```

### MCP Server Setup

`eolens` includes a Model Context Protocol (MCP) server providing 16 tools for AI assistants (Claude Desktop, Cursor, OpenCode, Antigravity, etc.).

**When installed globally:**
Add to your client's MCP configuration (e.g. `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "eolens": {
      "command": "eolens",
      "args": ["mcp"]
    }
  }
}
```

**When running from source:**
```json
{
  "mcpServers": {
    "eolens": {
      "command": "node",
      "args": ["/absolute/path/to/eolens/bin/eolens.js", "mcp"]
    }
  }
}
```

**For OpenCode (`opencode.json`):**
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "eolens": {
      "type": "local",
      "command": ["eolens", "mcp"],
      "enabled": true
    }
  }
}
```

## CLI Usage

```
eolens [options] [command]

Commands:
  edf    Inspect, decrypt, and encrypt .edf string files
  map    Inspect, query, and convert .emf map files
  pub    Inspect, query, and convert pub files (.eif, .enf, .esf, .ecf)
  egf    Inspect and extract bitmaps from .egf archives
  quest  Inspect EO+ quest files (.eqf / .txt) and export to JSON
  mcp    Start the MCP stdio server for AI agents
```

### EDF

```bash
# decrypt to console
eolens edf decrypt dat005.edf
eolens edf decrypt dat005.edf --json -o lines.json
eolens edf decrypt dat005.edf -l 42

# encrypt back
eolens edf encrypt lines.txt -o dat005.edf --id 5
eolens edf encrypt lines.json -o dat005.edf
```

File ID is auto-detected from the filename (`dat003.edf` → 3) when `--id` is omitted.

### Map (.emf)

```bash
eolens map inspect 00001.emf
eolens map inspect 00001.emf --json
eolens map warps 00001.emf
eolens map npcs 00001.emf --json
eolens map tile 00001.emf -x 10 -y 20
eolens map to-json 00001.emf -o map.json
eolens map from-json map.json -o 00001.emf
eolens map tiles 00001.emf   # per-layer graphic-ID census (find road networks, dominant tiles)
```

### Map preview (PNG)

Renders an `.emf` map to PNG with the same tile mapping as eoweb (isometric 64x32 tiles, per-layer gfx files and anchor offsets, animation frame 0, static tiles only). Needs a directory of `gfxNNN.egf` files. Ideal for visually checking a map after edits — the PNG can be fed back to an AI for review.

```bash
eolens map preview 00001.emf --gfx-dir ./gfx -o preview.png
eolens map preview 00001.emf --gfx-dir ./gfx --scale 0.5 -o preview_small.png
```

### Pub (.eif / .enf / .esf / .ecf)

```bash
# type auto-detected from extension / content
eolens pub inspect pub/dat001.eif --search "sword" -l 10
eolens pub inspect pub/dtn001.enf --id 4 --json
eolens pub to-json pub/dsl001.esf -o spells.json
eolens pub from-json spells.json -t esf -o dsl001.esf
```

### EGF

```bash
eolens egf list gfx001.egf
eolens egf list gfx001.egf --json
eolens egf extract gfx001.egf --id 100 -o 100.bmp
eolens egf extract gfx001.egf --id 100 -o 100.png   # PNG output via .png extension
eolens egf sheet gfx003.egf --ids 395,477,555 -o sheet.png   # contact sheet (resource IDs)
```

### Quest (.eqf / .txt)

Same EO+ format Acorn loads from `Data/quests` (numeric filename = quest ID, e.g. `00013.eqf`). See [Apollo's EO+ guide](https://apollo-games.com/eoplus/) for the syntax.

```bash
eolens quest inspect 00001.txt
eolens quest inspect 00001.txt --json
eolens quest states 00001.txt
eolens quest list ./quests --json
eolens quest to-json 00001.txt -o quest.json
```

### MCP server

```bash
eolens mcp
# or: pnpm mcp
```

Stdio tools exposed:

- `eolens_edf_decrypt` / `eolens_edf_encrypt`
- `eolens_map_summary` / `eolens_map_inspect_tile` / `eolens_map_to_json` / `eolens_map_from_json` / `eolens_map_preview` / `eolens_map_tiles`
- `eolens_pub_query` / `eolens_pub_to_json` / `eolens_pub_from_json`
- `eolens_egf_list` / `eolens_egf_extract` / `eolens_egf_sheet`
- `eolens_quest_summary` / `eolens_quest_to_json`

See [MCP Server Setup](#mcp-server-setup) above for client configuration examples (Claude Desktop, Cursor, OpenCode, etc.).

## Agent skill

`SKILL.md` at the repo root documents the CLI, MCP tools, and EO modding workflows for AI agents. Install it with the skills CLI:

```bash
npx skills add do4k/eolens
```

## Library usage

```ts
import { decryptEdf, readMap, getMapSummary, readPub, queryPub } from 'eolens';

const lines = decryptEdf(rawEdf, { fileId: 5 });

const map = readMap(emfBytes);
const summary = getMapSummary(map);

const pub = readPub('eif', eifBytes);
const { results, total } = queryPub('eif', pub, { search: 'sword', limit: 10 });
```

## Development

```bash
pnpm install
pnpm dev -- map inspect 00001.emf
pnpm build
pnpm test
```

Project layout:

- `src/core/` – pure parsers/serializers (edf, map, pub, rid, egf/)
- `src/cli/` – commander CLI
- `src/mcp/` – MCP stdio server
- `bin/eolens.js` – built entry

## License

MIT
