/**
 * Artifact detection — shared between TaskTrace, completion verifiers, and UI push.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolve } from 'node:path';
import { isPathAllowed } from '../tools/built-in/utils/security.js';

/** Deliverable extensions surfaced in chat + preview sidebar */
export const ARTIFACT_EXTENSIONS = new Set([
  '.pptx', '.docx', '.xlsx', '.pdf',
  '.html', '.htm', '.svg',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.csv', '.json', '.md',
]);

const ARTIFACT_PATH_RE = /(?:[A-Za-z0-9_./~-]+)\.(pptx|docx|xlsx|pdf|html?|svg|png|jpe?g|gif|webp|csv|json|md)\b/gi;

const OFFICECLI_CREATE_RE = /officecli\s+create\s+(\S+\.(?:pptx|docx|xlsx))/i;

export function isArtifactExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ARTIFACT_EXTENSIONS.has(ext);
}

export function isExistingArtifactFile(filePath: string): boolean {
  if (!filePath || !isArtifactExtension(filePath)) return false;
  try {
    const abs = resolve(filePath);
    if (!isPathAllowed(abs)) return false;
    const stat = fs.statSync(abs);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

/** Extract artifact paths mentioned in arbitrary tool output text */
export function extractArtifactPathsFromText(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const match of text.matchAll(ARTIFACT_PATH_RE)) {
    const p = match[0];
    if (p && !found.includes(p)) found.push(p);
  }
  return found;
}

function stringifyOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output == null) return '';
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function pathsFromFileToolInput(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as Record<string, unknown>;
  const command = obj.command;
  const filePath = obj.file_path;
  if (typeof filePath !== 'string') return [];
  if (command === 'create' || command === 'str_replace' || command === 'insert') {
    return [filePath];
  }
  return [];
}

function pathsFromSendFileInput(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const filePath = (input as Record<string, unknown>).filePath;
  return typeof filePath === 'string' ? [filePath] : [];
}

function pathsFromBashInput(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const command = (input as Record<string, unknown>).command;
  if (typeof command !== 'string') return [];
  const createMatch = command.match(OFFICECLI_CREATE_RE);
  if (createMatch?.[1]) return [createMatch[1]];
  return [];
}

/**
 * Resolve artifact file paths from a tool invocation (input + output).
 * Only returns paths that exist on disk and pass path security checks.
 */
export function detectArtifactsFromToolCall(
  toolName: string,
  input: unknown,
  output: unknown,
): string[] {
  const candidates = new Set<string>();

  for (const p of pathsFromSendFileInput(input)) candidates.add(p);
  for (const p of pathsFromFileToolInput(input)) candidates.add(p);
  if (toolName === 'bash' || toolName === 'Bash') {
    for (const p of pathsFromBashInput(input)) candidates.add(p);
  }

  const outputText = stringifyOutput(output);
  for (const p of extractArtifactPathsFromText(outputText)) candidates.add(p);

  // send-file success message embeds filename
  if (toolName === 'send-file' && outputText.includes('Sent')) {
    for (const p of extractArtifactPathsFromText(outputText)) candidates.add(p);
  }

  const resolved: string[] = [];
  for (const candidate of candidates) {
    const abs = resolve(candidate);
    if (isExistingArtifactFile(abs) && !resolved.includes(abs)) {
      resolved.push(abs);
    }
  }
  return resolved;
}
