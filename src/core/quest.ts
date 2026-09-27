import fs from 'node:fs';
import path from 'node:path';

export type QuestArg = { kind: 'int'; value: number } | { kind: 'str'; value: string };

export interface QuestAction {
  name: string;
  args: QuestArg[];
}

export interface QuestRule {
  name: string;
  args: QuestArg[];
  goto: string;
}

export interface QuestState {
  name: string;
  description: string;
  actions: QuestAction[];
  rules: QuestRule[];
}

export interface QuestData {
  id: number | null;
  name: string;
  version: number;
  states: QuestState[];
}

export interface QuestSummary extends QuestData {
  counts: {
    totalStates: number;
    totalActions: number;
    totalRules: number;
  };
}

/**
 * Extracts a quest ID from a filename like '00013.eqf', '00013.txt' or '13.eqf'.
 * Mirrors Acorn's QuestDataRepository which uses the numeric file stem as quest ID.
 * Returns null when the stem is not numeric.
 */
export function extractQuestIdFromPath(filePath: string): number | null {
  const stem = path.basename(filePath).replace(/\.(eqf|txt)$/i, '');
  if (!/^\d+$/.test(stem)) return null;
  return parseInt(stem, 10);
}

/**
 * Parses EO+ quest script text (EQF / .txt format) into a QuestData object.
 * Mirrors Acorn's QuestDataRepository.ParseQuest: strips // comments, parses the
 * Main block (questname, version) then each state block (desc, actions incl. bare
 * actions, rules). Block keywords are matched case-insensitively so both the
 * Apollo guide style (State) and Acorn data files (state) parse.
 */
export function parseQuest(content: string, id: number | null = null): QuestData | null {
  const lines = content
    .split('\n')
    .map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
    .filter((l) => !l.trimStart().startsWith('//'));
  const joined = lines.join('\n');

  const mainMatch = /Main\s*\{([^}]*)\}/is.exec(joined);
  if (!mainMatch) return null;
  const mainBody = mainMatch[1] ?? '';

  const nameMatch = /questname\s+"([^"]+)"/i.exec(mainBody);
  const versionMatch = /version\s+(\d+)/i.exec(mainBody);

  const name = nameMatch ? (nameMatch[1] as string) : id !== null ? `Quest ${id}` : 'Quest';
  const version = versionMatch ? parseInt(versionMatch[1] as string, 10) : 1;

  const states: QuestState[] = [];
  const stateRe = /state\s+(\w+)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/gis;
  let stateMatch: RegExpExecArray | null;
  while ((stateMatch = stateRe.exec(joined)) !== null) {
    states.push(parseQuestState(stateMatch[1] as string, stateMatch[2] as string));
  }

  if (states.length === 0) return null;

  return { id, name, version, states };
}

/**
 * Reads and parses a quest file (.eqf or .txt). The quest ID is taken from the
 * numeric file stem unless an explicit id is given.
 */
export function readQuestFile(filePath: string, id?: number): QuestData | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const questId = id ?? extractQuestIdFromPath(filePath);
  return parseQuest(content, questId);
}

function parseQuestState(name: string, body: string): QuestState {
  const descMatch = /desc\s+"([^"]+)"/i.exec(body);
  const description = descMatch ? (descMatch[1] as string) : '';

  const actions: QuestAction[] = [];
  const actionRe = /action\s+(\w+)\s*\(([^)]*)\)\s*;?/g;
  let m: RegExpExecArray | null;
  while ((m = actionRe.exec(body)) !== null) {
    actions.push({ name: m[1] as string, args: parseQuestArgs(m[2] as string) });
  }

  // Bare actions not prefixed with the "action" keyword, e.g. ShowHint("..."), Reset(), End()
  const bareRe = /^\s+(?!action\b|rule\b|desc\b|questname\b|version\b)(\w+)\s*\(([^)]*)\)\s*;?$/gim;
  while ((m = bareRe.exec(body)) !== null) {
    actions.push({ name: m[1] as string, args: parseQuestArgs(m[2] as string) });
  }

  const rules: QuestRule[] = [];
  const ruleRe = /rule\s+(\w+)\s*\(([^)]*)\)\s*goto\s+(\w+)/gi;
  while ((m = ruleRe.exec(body)) !== null) {
    rules.push({ name: m[1] as string, args: parseQuestArgs(m[2] as string), goto: m[3] as string });
  }

  return { name, description, actions, rules };
}

function parseQuestArgs(argsStr: string): QuestArg[] {
  const args: QuestArg[] = [];
  if (!argsStr || !argsStr.trim()) return args;

  let i = 0;
  while (i < argsStr.length) {
    while (i < argsStr.length && (/\s/.test(argsStr[i] as string) || argsStr[i] === ',')) i++;
    if (i >= argsStr.length) break;

    const ch = argsStr[i] as string;
    if (ch === '"') {
      i++;
      const start = i;
      while (i < argsStr.length && argsStr[i] !== '"') i++;
      args.push({ kind: 'str', value: argsStr.slice(start, i) });
      if (i < argsStr.length) i++;
    } else if (/[0-9]/.test(ch) || ch === '-') {
      const start = i;
      if (ch === '-') i++;
      while (i < argsStr.length && /[0-9]/.test(argsStr[i] as string)) i++;
      const val = parseInt(argsStr.slice(start, i), 10);
      if (!Number.isNaN(val)) args.push({ kind: 'int', value: val });
    } else {
      i++;
    }
  }

  return args;
}

/**
 * Returns a token-efficient summary of a parsed quest (quest header plus per-state
 * descriptions with action/rule counts) — ideal for AI consumption.
 */
export function getQuestSummary(quest: QuestData): QuestSummary {
  const totalActions = quest.states.reduce((n, s) => n + s.actions.length, 0);
  const totalRules = quest.states.reduce((n, s) => n + s.rules.length, 0);
  return {
    ...quest,
    counts: {
      totalStates: quest.states.length,
      totalActions,
      totalRules,
    },
  };
}

/**
 * Serializes a parsed quest to JSON.
 */
export function questToJson(quest: QuestData, pretty = true): string {
  return JSON.stringify(quest, null, pretty ? 2 : 0);
}

/**
 * Parses a quest JSON string back into a QuestData object.
 */
export function jsonToQuest(jsonStr: string): QuestData {
  return JSON.parse(jsonStr) as QuestData;
}
