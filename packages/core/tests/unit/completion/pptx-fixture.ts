/**
 * Minimal pptx-like zip fixtures for completion / visual-contract tests.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export async function buildPptxFixture(
  root: string,
  name: string,
  opts: { slides?: number; media?: boolean; charts?: boolean } = {},
): Promise<string> {
  const dir = join(root, name);
  await mkdir(join(dir, 'ppt', 'slides'), { recursive: true });
  const n = opts.slides ?? 2;
  for (let i = 1; i <= n; i++) {
    await writeFile(join(dir, 'ppt', 'slides', `slide${i}.xml`), `<s${i}/>`);
  }
  if (opts.media) {
    await mkdir(join(dir, 'ppt', 'media'), { recursive: true });
    await writeFile(join(dir, 'ppt', 'media', 'image1.png'), 'png');
  }
  if (opts.charts) {
    await mkdir(join(dir, 'ppt', 'charts'), { recursive: true });
    await writeFile(join(dir, 'ppt', 'charts', 'chart1.xml'), '<c/>');
  }
  const out = join(root, `${name}.pptx`);
  await execFileAsync('zip', ['-qr', out, 'ppt'], { cwd: dir });
  return out;
}
