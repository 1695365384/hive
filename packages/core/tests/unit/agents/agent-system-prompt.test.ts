import { describe, expect, it } from 'vitest';
import { PromptTemplate } from '../../../src/agents/prompts/PromptTemplate.js';

describe('agent-system prompt tool names (pi kernel)', () => {
  const tpl = new PromptTemplate();
  const text = tpl.render('agent-system', {});

  it('uses live pi / Hive extension tool names', () => {
    expect(text).toContain('`web_search`');
    expect(text).toContain('`read`');
    expect(text).toContain('`edit`');
    expect(text).toContain('`write`');
    expect(text).toContain('`send-file`');
    expect(text).toContain('`remember`');
    expect(text).toContain('`env`');
    expect(text).toContain('`web-fetch`');
    expect(text).toContain('`ask-user`');
  });

  it('does not advertise dead tool names as live tools', () => {
    // Ban-list mention of legacy names is OK; they must not appear as a tool-table row.
    expect(text).not.toMatch(/\|\s*`web-search`\s*\|/);
    expect(text).not.toMatch(/\|\s*`file`\s*\|/);
    expect(text).toMatch(/不要使用已下线的工具名/);
  });
});
