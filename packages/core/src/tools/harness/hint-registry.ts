/**
 * Hint template registry
 *
 * Grouped by tool, indexed by error code.
 * Templates receive ToolResult.context for variable interpolation.
 */

import type { HintTemplate, HintTemplateMap } from './types.js';

// ============================================
// file-tool hint templates
// ============================================

const FILE_HINTS: HintTemplateMap = {
  MATCH_FAILED: (ctx) =>
    `Hint: Use file view to read ${ctx.path ?? 'the target file'} and confirm current content. ` +
    `Pay attention to indentation, spaces, and newline differences. ` +
    `If the content differs from expected, the file may have been modified by another process.`,

  NOT_FOUND: (ctx) =>
    `Hint: Verify the path is correct, or use glob to search for similar filenames. ` +
    `If creating a new file, use the file create command.` +
    (ctx.path ? ` Target path: ${ctx.path}` : ''),

  PERMISSION: (ctx) =>
    `Hint: Current agent type lacks this permission (needed: ${ctx.command ?? 'unknown operation'}). ` +
    `For file writes, use a general agent. For bash commands, inform the user to run manually.`,

  PATH_BLOCKED: (ctx) =>
    `Hint: Path ${ctx.path ?? ''} is outside the allowed working directory. ` +
    `Choose a path within the workspace directory.`,

  INVALID_PARAM: (ctx) =>
    `Hint: Line number ${ctx.line ?? '?'} is out of range (file has ${ctx.total ?? '?'} lines). ` +
    `Use file view to confirm the total line count.`,

  MATCH_AMBIGUOUS: (ctx) =>
    `Hint: Found ${ctx.matchCount ?? 'multiple'} matches, cannot determine replacement position. ` +
    `Provide more context (e.g. surrounding function name, comments) to make the match unique, ` +
    `or use file view to confirm file content first.`,

  IO_ERROR: (ctx) =>
    `Hint: File operation failed (${ctx.path ?? ''}). ` +
    `This may be a permissions issue or insufficient disk space. Check and retry.`,

  SENSITIVE_FILE: (ctx) =>
    `Hint: Access denied to sensitive file (${ctx.description ?? 'sensitive file'}). ` +
    `Inform the user to handle it manually or use ask-user tool to request permission.`,
};

// ============================================
// bash-tool hint templates
// ============================================

const BASH_HINTS: HintTemplateMap = {
  TIMEOUT: (ctx) =>
    `Hint: Command timed out (${ctx.timeout ?? '?'}ms). ` +
    `Try increasing the timeout parameter or optimizing the command.`,

  EXEC_ERROR: (ctx) =>
    `Hint: Command execution failed. Check syntax and whether dependencies are installed.` +
    (ctx.command ? ` Command: ${ctx.command}` : '') +
    ` Try running a simplified command first to diagnose the issue.`,

  DANGEROUS_CMD: (ctx) =>
    `Hint: Command blocked by security policy (${ctx.description ?? 'dangerous operation'}). ` +
    `If execution is truly needed, inform the user.`,

  COMMAND_BLOCKED: () =>
    `Hint: Path-form commands are not allowed. ` +
    `Use the command name without a path prefix.`,
};

// ============================================
// send-file-tool hint templates
// ============================================

const SEND_FILE_HINTS: HintTemplateMap = {
  NETWORK: (ctx) =>
    `Hint: File send failed (network error: ${ctx.status ?? 'unknown'}). ` +
    `System will auto-retry. If it keeps failing, check network connectivity or try later.`,

  NOT_FOUND: (ctx) =>
    `Hint: File not found (${ctx.path ?? 'unknown path'}). ` +
    `Verify the file path is correct.`,

  PERMISSION: (ctx) =>
    `Hint: File sending not supported in current environment (${ctx.reason ?? 'no callback registered'}). ` +
    `File sending is only available when connected via a messaging channel (e.g. Feishu).`,
};

// ============================================
// web-search-tool hint templates
// ============================================

const WEB_SEARCH_HINTS: HintTemplateMap = {
  NETWORK: () =>
    `Hint: Search request failed (network error). System will auto-retry. ` +
    `If it keeps failing, try a different search term or retry later.`,
};

// ============================================
// web-fetch-tool hint templates
// ============================================

const WEB_FETCH_HINTS: HintTemplateMap = {
  NETWORK: (ctx) =>
    `Hint: Page fetch failed (HTTP ${ctx.status ?? 'unknown'}). System will auto-retry. ` +
    `If it keeps failing, try accessing the URL directly or retry later.`,

  PATH_BLOCKED: () =>
    `Hint: Access to private/internal network addresses is blocked by security policy. ` +
    `Use a public URL instead.`,

  INVALID_PARAM: (ctx) =>
    `Hint: Invalid URL format (${ctx.url ?? ''}). ` +
    `Provide a complete HTTPS URL (e.g. https://example.com).`,

  NOT_FOUND: () =>
    `Hint: Page content is empty. The page may require JavaScript rendering or have anti-scraping measures. ` +
    `Try visiting the URL directly to confirm.`,
};

// ============================================
// glob-tool hint templates
// ============================================

const GLOB_HINTS: HintTemplateMap = {
  PATH_BLOCKED: (ctx) =>
    `Hint: Search path ${ctx.path ?? ''} is outside the allowed working directory. ` +
    `Choose a path within the workspace directory.`,
};

// ============================================
// grep-tool hint templates
// ============================================

const GREP_HINTS: HintTemplateMap = {
  PATH_BLOCKED: (ctx) =>
    `Hint: Search path ${ctx.path ?? ''} is outside the allowed working directory. ` +
    `Choose a path within the workspace directory.`,

  INVALID_PARAM: (ctx) =>
    `Hint: Invalid regex pattern (${ctx.pattern ?? ''}). ` +
    `Check the regex syntax is correct.`,
};

// ============================================
// ask-user-tool hint templates
// ============================================

const ASK_USER_HINTS: HintTemplateMap = {
  PERMISSION: () =>
    `Hint: User interaction not supported in current environment. Ensure a callback is registered via ToolRegistry.`,

  EXEC_ERROR: () =>
    `Hint: Failed to get user response. Check if the callback function is working properly.`,
};

// ============================================
// Registry grouped by tool (for getHint(toolName, code, context))
// ============================================

const TOOL_HINT_MAP: Record<string, HintTemplateMap> = {
  'file-tool': FILE_HINTS,
  'bash-tool': BASH_HINTS,
  'send-file-tool': SEND_FILE_HINTS,
  'web-search-tool': WEB_SEARCH_HINTS,
  'web-fetch-tool': WEB_FETCH_HINTS,
  'glob-tool': GLOB_HINTS,
  'grep-tool': GREP_HINTS,
  'ask-user-tool': ASK_USER_HINTS,
};

// ============================================
// Global merge (non-conflicting keys, FILE_HINTS as default)
// ============================================

const ALL_HINTS: HintTemplateMap = { ...BASH_HINTS, ...SEND_FILE_HINTS, ...WEB_SEARCH_HINTS, ...WEB_FETCH_HINTS, ...GLOB_HINTS, ...GREP_HINTS, ...ASK_USER_HINTS, ...FILE_HINTS };

/**
 * Get hint by error code and context (legacy API)
 *
 * @returns hint string, or undefined if no matching template
 */
export function getHint(
  code: string,
  context: Record<string, unknown> = {},
): string | undefined {
  const template = ALL_HINTS[code];
  if (!template) return undefined;
  return template(context);
}

/**
 * Get hint by tool name and error code
 *
 * Looks up the specified tool's templates first, falls back to global ALL_HINTS.
 *
 * @param toolName - Tool name (e.g. 'file-tool', 'grep-tool')
 * @param code - Error code
 * @param context - Context variables
 * @returns hint string, or undefined if no matching template
 */
export function getHintForTool(
  toolName: string,
  code: string,
  context: Record<string, unknown> = {},
): string | undefined {
  // Prefer tool-specific template
  const toolTemplate = TOOL_HINT_MAP[toolName]?.[code];
  if (toolTemplate) return toolTemplate(context);
  // Fall back to global
  return getHint(code, context);
}

/**
 * Get hint templates for a specific tool
 */
export function getToolHintTemplates(toolName: string): HintTemplateMap {
  return TOOL_HINT_MAP[toolName] ?? {};
}

/**
 * Get all hint templates (for withHarness default config)
 */
export function getAllHintTemplates(): HintTemplateMap {
  return { ...ALL_HINTS };
}

export { FILE_HINTS, BASH_HINTS, SEND_FILE_HINTS, WEB_SEARCH_HINTS, WEB_FETCH_HINTS, GLOB_HINTS, GREP_HINTS, ASK_USER_HINTS };
