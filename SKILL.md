---
name: eolens
description: "Work with Endless Online game files using eolens (CLI, MCP, library). Triggers on: inspect or edit EO maps (.emf), pub files (.eif/.enf/.esf/.ecf NPCs/items/spells/classes), dialog strings (.edf), graphic archives (.egf), EO+ quests (.eqf/.txt), Acorn quest behavior, NPC creation, map tile editing, Aeven or other EO map variants."
---

# eolens — Lens of Truth for Endless Online game files

CLI + MCP server + importable library for `.edf`, `.emf`, `.pub`, `.egf`, and EO+ quest (`.eqf`/`.txt`) files. Built on `eolib`. Repo: the directory containing this file.

## Build & run

```bash
pnpm install
pnpm build
node ./bin/eolens.js --help        # CLI
node ./bin/eolens.js mcp           # MCP stdio server (13 tools)
```

MCP is configured per-project via `opencode.json` (`node <abs path>/bin/eolens.js mcp`). After changing `src/mcp/*`, rebuild and restart the MCP server session to pick up new tools.

## CLI quick reference

```bash
# Maps (.emf)
eolens map inspect 00005.emf               # human summary: NPCs, warps, chests, signs
eolens map inspect 00005.emf --json
eolens map warps 00005.emf
eolens map npcs 00005.emf --json
eolens map tile 00005.emf -x 41 -y 47
eolens map to-json 00005.emf -o map.json
eolens map from-json map.json -o 00005.emf  # recalculates CRC32 RID

# Pubs (.eif item / .enf npc / .esf spell / .ecf class — type auto-detected)
eolens pub inspect pub/dtn001.enf --search "priest" -l 10
eolens pub inspect pub/dtn001.enf --id 114 --json
eolens pub to-json pub/dtn001.enf -o npc.json
eolens pub from-json npc.json -t enf -o dtn001.enf

# Dialog strings (.edf — file ID auto-detected from datNNN.edf name)
eolens edf decrypt dat005.edf | head
eolens edf encrypt lines.txt -o dat005.edf --id 5

# Graphics archives (.egf)
eolens egf list gfx003.egf
eolens egf extract gfx003.egf --id 455 -o tile.bmp   # 32-bit BMP, transparency preserved

# EO+ quests (.eqf / .txt — same format Acorn loads from Data/quests)
eolens quest inspect 00057.txt
eolens quest states 00057.txt
eolens quest list ./quests
eolens quest to-json 00057.txt -o quest.json
```

## MCP tools (13)

`eolens_edf_decrypt`, `eolens_edf_encrypt`, `eolens_map_summary`, `eolens_map_inspect_tile`, `eolens_map_to_json`, `eolens_map_from_json`, `eolens_pub_query`, `eolens_pub_to_json`, `eolens_pub_from_json`, `eolens_egf_list`, `eolens_egf_extract`, `eolens_quest_summary`, `eolens_quest_to_json`.

Prefer `*_summary` / `inspect` / `states` for reading (token-efficient); use `to-json` only when full data is needed for editing.

## Library

```ts
import { readMap, getMapSummary, readPub, queryPub, parseQuest, getQuestSummary } from 'eolens';
```

Core lives in `src/core/*` (`edf.ts`, `map.ts`, `pub.ts`, `quest.ts`, `rid.ts`, `egf/`); CLI in `src/cli/commands/*`; MCP in `src/mcp/index.ts`.

## Domain rules (learned the hard way — follow these)

- **Pub record IDs are 1-based in game.** Map spawn entries, quest `KilledNpcs`/`GotItems` args, and Acorn (`EnfExtension.GetNpc`: `index = id - 1`) all use 1-based IDs. `queryPub` reports game IDs.
- **Acorn serves quest dialog by NPC `BehaviorId`, not NPC ID.** Quest `AddNpcText(56, ...)` matches the NPC whose `behaviorId` is 56.
- **Talkable NPCs must have `type: 15` (Quest).** Acorn ignores dialog for any other type.
- **There is no "player said X in chat" quest rule.** `QuestRuleEvaluator` only knows items, kills, maps, coords, class/gender/race (`TalkedToNpc`/`InputNpc` are handled in the dialog flow). For "say :O" mechanics, use `AddNpcInput(npc, linkId, ":O")` + `rule InputNpc(linkId) goto Next`.
- **Quest IDs come from numeric filenames** (`00057.txt`/`00057.eqf` → quest 57), same in Acorn and EO+. `.eqf` and `.txt` parse identically.
- **NPC appearance = one sprite `graphicId`.** NPCs can't wear items and have no hair fields (hair is player-side). E.g. graphic 86 = Priest robe. Check before claiming a look.
- **ENF files end with an `"eof"` terminator record.** Append new NPCs after it; never insert in the middle (IDs shift).
- **Map edits go through JSON round-trip** (`map to-json` → edit → `map from-json`; same for pubs). RID checksums recalculate automatically. Always re-read the compiled file and diff record counts/content against the original before shipping.
- **Keep generated artifacts out of git** (`output/`, machine-local `opencode.json` with absolute paths).

## Recipes

**Map variant that plays like the original but looks seasonal** (e.g. summer Aeven):
1. `map to-json` on base map and on the official seasonal variant.
2. Merge: take seasonal `_graphicLayers`, `_musicId`, `_timedEffect`; keep base `_npcs`, `_warpRows`, `_tileSpecRows`, `_signs`, `_items`, `_relogX/_relogY`.
3. `map from-json`, then verify NPC/warp lists are identical to base.
4. Retile ground details by graphic ID on layer 0 (e.g. brick path 549/551/552/553/557 → sand 455, cf. Aeven Port usage). Verify walkability unchanged via `map tile`.

**New NPC + quest + map spawn bundle:**
1. Find free game ID (`max existing + 1`, after the `eof` record) and free behavior ID; mirror a harmless NPC's stats with `type: 15`.
2. Append via `pub to-json` → edit → `pub from-json`; verify count +1 and all prior records identical.
3. Write quest `.txt` referencing the behavior ID; verify with `quest inspect` (state/action/rule counts).
4. Add spawn `{id, x, y}` on a walkable tile via `map to-json` → edit → `map from-json`; verify with `map summary` + `map tile`.

## Reference links

- EO+ quest syntax: https://apollo-games.com/eoplus/
- Acorn quest loading: `Acorn/src/Acorn/Data/QuestDataRepository.cs` (regex parser mirrored by `src/core/quest.ts`)
- Map render math (iso projection, `LAYER_GFX_MAP`, per-layer offsets): `eoweb/src/map.ts`; GFX files `gfx001–025.egf`
