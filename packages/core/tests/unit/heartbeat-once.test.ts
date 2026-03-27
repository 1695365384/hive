/**
 * 7.3 runHeartbeatOnce() 测试
 *
 * 验证 HEARTBEAT_OK 解析和 alert 检测
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../../src/agents/core/Agent.js';

describe('Agent.runHeartbeatOnce()', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent();
  });

  it('回复 HEARTBEAT_OK 时 isOk 应为 true', async () => {
    // Mock chat 方法返回 HEARTBEAT_OK
    vi.spyOn(agent, 'chat').mockResolvedValue('HEARTBEAT_OK');

    const result = await agent.runHeartbeatOnce();

    expect(result.isOk).toBe(true);
    expect(result.hasAlert).toBe(false);
    expect(result.content).toBe('');
  });

  it('回复 HEARTBEAT_OK: extra info 时 isOk 应为 true', async () => {
    vi.spyOn(agent, 'chat').mockResolvedValue('HEARTBEAT_OK: All systems nominal');

    const result = await agent.runHeartbeatOnce();

    expect(result.isOk).toBe(true);
    expect(result.hasAlert).toBe(false);
    expect(result.content).toBe('');
  });

  it('回复非 HEARTBEAT_OK 时 hasAlert 应为 true', async () => {
    vi.spyOn(agent, 'chat').mockResolvedValue('WARNING: Build is failing on CI');

    const result = await agent.runHeartbeatOnce();

    expect(result.isOk).toBe(false);
    expect(result.hasAlert).toBe(true);
    expect(result.content).toBe('WARNING: Build is failing on CI');
  });

  it('回复包含 alert 内容时应保留完整内容', async () => {
    const alertText = 'Found 3 issues:\n1. Memory leak in auth module\n2. Pending migration\n3. SSL cert expiring';
    vi.spyOn(agent, 'chat').mockResolvedValue(alertText);

    const result = await agent.runHeartbeatOnce();

    expect(result.isOk).toBe(false);
    expect(result.hasAlert).toBe(true);
    expect(result.content).toBe(alertText);
  });

  it('使用默认 prompt 时应包含 HEARTBEAT.md 指令', async () => {
    const chatSpy = vi.spyOn(agent, 'chat').mockResolvedValue('HEARTBEAT_OK');

    await agent.runHeartbeatOnce();

    expect(chatSpy).toHaveBeenCalledWith(
      expect.stringContaining('HEARTBEAT.md'),
      expect.any(Object)
    );
  });

  it('使用自定义 prompt 时应覆盖默认值', async () => {
    const customPrompt = 'Check the deployment status and report any issues.';
    const chatSpy = vi.spyOn(agent, 'chat').mockResolvedValue('HEARTBEAT_OK');

    await agent.runHeartbeatOnce({ prompt: customPrompt });

    expect(chatSpy).toHaveBeenCalledWith(customPrompt, expect.any(Object));
  });

  it('应触发 onResult 回调', async () => {
    vi.spyOn(agent, 'chat').mockResolvedValue('HEARTBEAT_OK');

    const onResult = vi.fn();
    await agent.runHeartbeatOnce({ onResult });

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ isOk: true, hasAlert: false })
    );
  });

  it('onResult 回调应包含 alert 内容', async () => {
    const alertContent = 'Build failing';
    vi.spyOn(agent, 'chat').mockResolvedValue(alertContent);

    const onResult = vi.fn();
    await agent.runHeartbeatOnce({ onResult });

    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        isOk: false,
        hasAlert: true,
        content: alertContent,
      })
    );
  });

  it('应支持指定 model', async () => {
    const chatSpy = vi.spyOn(agent, 'chat').mockResolvedValue('HEARTBEAT_OK');

    await agent.runHeartbeatOnce({ model: 'claude-haiku-4-5-20251001' });

    expect(chatSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ modelId: 'claude-haiku-4-5-20251001' })
    );
  });

  it('回复前后有空白时仍能正确解析 HEARTBEAT_OK', async () => {
    vi.spyOn(agent, 'chat').mockResolvedValue('  \n  HEARTBEAT_OK  \n  ');

    const result = await agent.runHeartbeatOnce();

    expect(result.isOk).toBe(true);
  });
});
