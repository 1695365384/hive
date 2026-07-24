/**
 * Coordinator prompt 契约测试
 */

import { describe, it, expect } from 'vitest';
import { DELEGATABLE_WORKER_TYPES } from '../../src/agents/core/worker-types.js';
import { buildCoordinatorSystemPrompt } from './contract-helpers.js';

// AgentLoop migration — CoordinatorCapability removed
describe.skip('Coordinator Prompt Contract', () => {
  it('includes every delegatable worker in rendered system prompt', async () => {
    const system = await buildCoordinatorSystemPrompt('Create a quarterly PPT');

    for (const type of DELEGATABLE_WORKER_TYPES) {
      expect(system).toContain(`"${type}"`);
    }
  });

  it('documents Office worker routing in complexity table', async () => {
    const system = await buildCoordinatorSystemPrompt('Create a PPT about AI');

    expect(system).toContain('Office Worker');
    expect(system).toMatch(/Explore then Office|optional parallel Explore|Explore ∥ Office/);
  });

  it('does not inject intelligent.md (direct-execution mode)', async () => {
    const system = await buildCoordinatorSystemPrompt('Implement a feature');

    expect(system).not.toContain('You are a capable assistant');
    expect(system).not.toContain('## Response Guidelines');
    expect(system).toContain('Coordinator agent');
  });

  it('includes dynamic agent tool description with office worker', async () => {
    const system = await buildCoordinatorSystemPrompt('Make a Word report');

    expect(system).toContain('Office document specialist');
    expect(system).toContain('officecli');
  });
});
