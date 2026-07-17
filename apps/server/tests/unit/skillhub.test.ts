/**
 * SkillHub 安装客户端单元测试（mock fetch / unzip）
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installFromSkillHub,
  isSkillHubSource,
  searchSkillHub,
} from '../../src/skillhub.js';

describe('skillhub', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('识别 skillhub 源', () => {
    expect(isSkillHubSource('skillhub')).toBe(true);
    expect(isSkillHubSource('')).toBe(true);
    expect(isSkillHubSource('findscripter/everything-skills')).toBe(false);
  });

  it('searchSkillHub 解析结果', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              slug: 'calendar',
              displayName: 'Calendar',
              description: 'Calendar management\n日历管理',
              category: 'life-service',
              version: '1.0.0',
            },
          ],
        }),
      })),
    );

    const results = await searchSkillHub('calendar');
    expect(results).toHaveLength(1);
    expect(results[0].slug).toBe('calendar');
    expect(results[0].description).toBe('日历管理');
  });

  it('installFromSkillHub 拒绝非法 slug', async () => {
    await expect(installFromSkillHub('../evil', os.tmpdir())).rejects.toThrow(
      /Invalid SkillHub slug/,
    );
  });

  it('installFromSkillHub 下载并解压扁平 zip', async () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-skillhub-tgt-'));
    const zipPath = path.join(os.tmpdir(), `hive-skillhub-src-${Date.now()}.zip`);

    // 用系统 zip 打一个含 SKILL.md 的扁平包
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-skillhub-stage-'));
    fs.writeFileSync(
      path.join(staging, 'SKILL.md'),
      '---\nname: demo-skill\ndescription: demo\nversion: 1.0.0\n---\n\n# Demo\n',
    );
    const { execFileSync } = await import('node:child_process');
    execFileSync('zip', ['-qr', zipPath, 'SKILL.md'], { cwd: staging });

    const zipBuf = fs.readFileSync(zipPath);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () =>
          zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength),
      })),
    );

    try {
      const result = await installFromSkillHub('demo-skill', targetDir);
      expect(result.installed).toContain('demo-skill');
      expect(fs.existsSync(path.join(targetDir, 'demo-skill', 'SKILL.md'))).toBe(true);
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.rmSync(staging, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    }
  });
});
