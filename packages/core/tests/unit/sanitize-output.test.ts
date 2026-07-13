import { describe, it, expect } from 'vitest';
import { stripDecorativeEmoji } from '../../src/utils/sanitize-output.js';

describe('stripDecorativeEmoji', () => {
  it('removes common emojis and decorative symbols', () => {
    const input = '✅ 完成！文件已保存 🎉\n路径：/tmp/a.pptx 👍';
    const output = stripDecorativeEmoji(input);
    expect(output).not.toMatch(/[🎉👍✅]/);
    expect(output).toContain('完成');
    expect(output).toContain('/tmp/a.pptx');
  });

  it('preserves normal Chinese and English text', () => {
    const input = '任务完成，输出文件 /tmp/report.docx';
    expect(stripDecorativeEmoji(input)).toBe(input);
  });

  it('handles empty input', () => {
    expect(stripDecorativeEmoji('')).toBe('');
  });
});
