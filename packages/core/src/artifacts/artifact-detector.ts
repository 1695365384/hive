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

/**
 * Unicode-safe path tail before extension (supports CJK filenames like 项目汇报.pptx).
 * Excludes markdown noise chars (*, `, []) so "**deck.pptx" / "`/tmp/a.pptx`" do not stick.
 */
const ARTIFACT_PATH_RE =
  /(?:\/|\.\/|\.\.\/|[A-Za-z]:[\\/])[^\s"'<>|*`\[\]\n]*\.(pptx|docx|xlsx|pdf|html?|svg|png|jpe?g|gif|webp|csv|json|md)\b|[^\s"'<>|*`\[\]\/\n:：]+\.(pptx|docx|xlsx|pdf|html?|svg|png|jpe?g|gif|webp|csv|json|md)\b/gi;

/** officecli create — bash form and MCP form (command without "officecli " prefix) */
const OFFICECLI_CREATE_RE =
  /(?:^|\s)(?:officecli\s+)?create\s+(\S+\.(?:pptx|docx|xlsx))\b/i;

/** Explicit screenshot / export output: -o out.png / --output path */
const OFFICECLI_OUTPUT_RE =
  /(?:^|\s)(?:-o|--output|--out)\s+(\S+\.(?:png|jpe?g|webp|gif|pdf|html?|svg))\b/gi;

/**
 * Strip markdown / prose wrappers from a matched path token.
 * Regression: Coordinator replies like `**项目汇报示例.pptx**` used to be recorded
 * literally and failed office verify with "not found on disk: **….pptx".
 */
export function sanitizeArtifactPath(raw: string): string {
  let p = raw.trim();
  if (!p) return '';

  // Prefer a clean path-like substring if prose leaked into the match
  const nested = p.match(
    /(?:\/|\.\/|\.\.\/|[A-Za-z]:[\\/])[^\s"'<>|*`\[\]\n]*\.(?:pptx|docx|xlsx|pdf|html?|svg|png|jpe?g|gif|webp|csv|json|md)\b|[^\s"'<>|*`\[\]\/\n:：]+\.(?:pptx|docx|xlsx|pdf|html?|svg|png|jpe?g|gif|webp|csv|json|md)\b/i,
  );
  if (nested?.[0]) p = nested[0];

  p = p.replace(/^[`"'*~_]+/, '').replace(/[`"'*~_]+$/, '');
  p = p.replace(/[)\]}>.,;:!?。，、；：！？]+$/u, '');
  return p.trim();
}

export function isArtifactExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ARTIFACT_EXTENSIONS.has(ext);
}

/** Final Office deliverables that unlock chat Preview (not screenshots). */
export function isOfficeDocumentPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.pptx' || ext === '.docx' || ext === '.xlsx';
}

/**
 * Extensions auto-pushed into Desktop chat without an explicit send-file.
 * Intermediate screenshots / preview HTML stay out of the transcript.
 */
export const CHAT_AUTO_EMIT_EXTENSIONS = new Set([
  '.pptx', '.docx', '.xlsx', '.pdf',
]);

const CHAT_NOISE_BASENAME_RE =
  /(^|[_-])(preview|screenshot|thumb)([_-]|\.|$)|_preview\.(png|jpe?g|webp|gif|html?)$|\.preview\.(html?|png)$/i;

/** True for primary user deliverables (.pptx/.docx/.xlsx/.pdf), excluding preview byproducts. */
export function isChatAutoEmitPath(filePath: string): boolean {
  const base = path.basename(filePath);
  if (CHAT_NOISE_BASENAME_RE.test(base)) return false;
  const ext = path.extname(filePath).toLowerCase();
  return CHAT_AUTO_EMIT_EXTENSIONS.has(ext);
}

/**
 * Whether a detected path should appear as a chat file card.
 * - send-file: always (user-facing delivery, including intentional images)
 * - everything else: only primary Office/PDF documents
 */
export function shouldEmitArtifactToChat(toolName: string, filePath: string): boolean {
  if (!filePath) return false;
  if (toolName.toLowerCase() === 'send-file') return true;
  return isChatAutoEmitPath(filePath);
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
    const p = sanitizeArtifactPath(match[0] ?? '');
    if (p && !found.includes(p)) found.push(p);
  }
  return found;
}

function stringifyPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload == null) return '';
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
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

/** Normalize bash / officecli MCP `command` field (string or argv array). */
export function normalizeToolCommand(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const command = (input as Record<string, unknown>).command;
  if (typeof command === 'string') return command;
  if (Array.isArray(command)) {
    return command
      .filter((part): part is string => typeof part === 'string')
      .join(' ');
  }
  return '';
}

/**
 * Paths referenced by an officecli / bash command line.
 * Covers create targets, -o screenshot outputs, and any artifact path tokens.
 */
export function pathsFromOfficeCommand(command: string): string[] {
  if (!command) return [];
  const found: string[] = [];

  const createMatch = command.match(OFFICECLI_CREATE_RE);
  if (createMatch?.[1]) {
    const p = sanitizeArtifactPath(createMatch[1]);
    if (p && !found.includes(p)) found.push(p);
  }

  for (const match of command.matchAll(OFFICECLI_OUTPUT_RE)) {
    const p = sanitizeArtifactPath(match[1] ?? '');
    if (p && !found.includes(p)) found.push(p);
  }

  for (const p of extractArtifactPathsFromText(command)) {
    if (!found.includes(p)) found.push(p);
  }

  return found;
}

function isBashOrShellTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === 'bash' || name === 'shell';
}

function isOfficeCliTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === 'officecli' || name.includes('officecli');
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
  const bashLike = isBashOrShellTool(toolName);
  const officeCli = isOfficeCliTool(toolName);

  for (const p of pathsFromSendFileInput(input)) candidates.add(sanitizeArtifactPath(p));
  for (const p of pathsFromFileToolInput(input)) candidates.add(sanitizeArtifactPath(p));

  if (bashLike || officeCli) {
    for (const p of pathsFromOfficeCommand(normalizeToolCommand(input))) {
      candidates.add(sanitizeArtifactPath(p));
    }
  }

  // Scan tool input text (commands / MCP payloads embed target paths)
  for (const p of extractArtifactPathsFromText(stringifyPayload(input))) {
    candidates.add(p);
  }

  const outputText = stringifyPayload(output);

  // bash/shell stdout is often `ls` noise — do NOT harvest every *.pptx in cwd.
  // officecli / send-file / other tools may only mention the path in the result.
  if (!bashLike) {
    for (const p of extractArtifactPathsFromText(outputText)) candidates.add(p);
  }

  // send-file success message embeds filename
  if (toolName.toLowerCase() === 'send-file' && outputText.includes('Sent')) {
    for (const p of extractArtifactPathsFromText(outputText)) candidates.add(p);
  }

  const resolved: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const abs = resolve(candidate);
    if (isExistingArtifactFile(abs) && !resolved.includes(abs)) {
      resolved.push(abs);
    }
  }
  return resolved;
}
