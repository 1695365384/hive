/**
 * 会话工作区（Session Workspace）
 *
 * 每个 chat/session 拥有独立写目录：
 *   $HIVE_HOME/sessions/<sessionId>/workspace
 *
 * 约定：
 * - 写操作（file create/edit、默认 bash cwd）落在 workspace
 * - 读操作仍可访问仓库 cwd / HIVE_WORKING_DIR / HIVE_HOME
 * - 通过 AsyncLocalStorage 绑定，支持并发会话互不覆盖
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface SessionFsContext {
  sessionId: string;
  /** 本会话唯一可写根目录 */
  workspaceDir: string;
  /** 额外可读根（通常含仓库 cwd） */
  readRoots: string[];
}

const als = new AsyncLocalStorage<SessionFsContext>();

/** 解析 Hive 家目录（HIVE_HOME > ~/.hive） */
export function getHiveHomeDir(): string {
  const fromEnv = process.env.HIVE_HOME?.trim();
  return resolve(fromEnv && fromEnv.length > 0 ? fromEnv : join(homedir(), '.hive'));
}

/**
 * 将会话 ID 收敛为安全目录名（避免路径穿越）
 */
export function sanitizeSessionId(sessionId: string): string {
  const trimmed = sessionId.trim() || 'default';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'default';
}

/** 会话工作区绝对路径（未确保目录存在） */
export function getSessionWorkspacePath(sessionId: string): string {
  return join(getHiveHomeDir(), 'sessions', sanitizeSessionId(sessionId), 'workspace');
}

/** 确保会话工作区存在并返回绝对路径 */
export function ensureSessionWorkspace(sessionId: string): string {
  const dir = getSessionWorkspacePath(sessionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 构造默认可读根：cwd + HIVE_WORKING_DIR 分段 + HIVE_HOME */
export function buildDefaultReadRoots(): string[] {
  const roots = new Set<string>();
  roots.add(resolve(process.cwd()));

  const envDir = process.env.HIVE_WORKING_DIR;
  if (envDir) {
    for (const part of envDir.split(':')) {
      const trimmed = part.trim();
      if (trimmed) roots.add(resolve(trimmed));
    }
  }

  roots.add(getHiveHomeDir());
  return [...roots];
}

export function createSessionFsContext(
  sessionId: string,
  cwdOverride?: string,
): SessionFsContext {
  const workspaceDir = cwdOverride?.trim()
    ? (() => {
        const dir = resolve(cwdOverride.trim());
        mkdirSync(dir, { recursive: true });
        return dir;
      })()
    : ensureSessionWorkspace(sessionId);

  return {
    sessionId: sanitizeSessionId(sessionId),
    workspaceDir,
    readRoots: buildDefaultReadRoots(),
  };
}

export function runWithSessionFs<T>(ctx: SessionFsContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getSessionFs(): SessionFsContext | undefined {
  return als.getStore();
}

/**
 * 工具默认工作目录：
 * - 有会话上下文 → session workspace
 * - 否则 → process.cwd()
 */
export function getWorkingDirectory(): string {
  return getSessionFs()?.workspaceDir ?? process.cwd();
}
