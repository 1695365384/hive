/**
 * ScenarioRegistry — 场景注册表（单一事实来源）
 */

import type { ScenarioDefinition } from './types.js';

export class ScenarioRegistry {
  private scenarios: ScenarioDefinition[] = [];

  register(scenario: ScenarioDefinition): this {
    if (this.scenarios.some(s => s.id === scenario.id)) {
      throw new Error(`Scenario already registered: ${scenario.id}`);
    }
    this.scenarios.push(scenario);
    this.scenarios.sort((a, b) => b.priority - a.priority);
    return this;
  }

  list(): readonly ScenarioDefinition[] {
    return this.scenarios;
  }

  getById(id: string): ScenarioDefinition | undefined {
    return this.scenarios.find(s => s.id === id);
  }

  /** 返回 priority 最高且 match 的第一个场景 */
  findBestMatch(task: string): ScenarioDefinition | null {
    for (const scenario of this.scenarios) {
      if (scenario.match(task)) {
        return scenario;
      }
    }
    return null;
  }
}
