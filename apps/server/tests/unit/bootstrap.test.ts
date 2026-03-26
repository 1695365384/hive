import { describe, expect, it } from 'vitest'

import { normalizeFeishuPluginConfig } from '../../src/bootstrap.js'

describe('normalizeFeishuPluginConfig', () => {
  it('returns the original config when no feishu channel config is present', () => {
    const input = { someOtherKey: 'value' }
    expect(normalizeFeishuPluginConfig(input)).toEqual(input)
  })

  it('injects an empty groups object when groups are not configured', () => {
    const config = normalizeFeishuPluginConfig({
      channels: {
        feishu: {
          appId: 'app-id',
          appSecret: 'app-secret',
          connectionMode: 'websocket',
          groupPolicy: 'allowlist',
          groupAllowFrom: ['*'],
        },
      },
    }) as {
      channels: {
        feishu: {
          appId: string
          appSecret: string
          connectionMode: string
          groupPolicy: string
          groupAllowFrom: string[]
          groups: Record<string, unknown>
        }
      }
    }

    expect(config.channels.feishu).toMatchObject({
      appId: 'app-id',
      appSecret: 'app-secret',
      connectionMode: 'websocket',
      groupPolicy: 'allowlist',
      groupAllowFrom: ['*'],
    })
    expect(config.channels.feishu.groups).toEqual({})
  })

  it('falls back to an empty groups object when groups is not a plain object', () => {
    const config = normalizeFeishuPluginConfig({
      channels: {
        feishu: {
          appId: 'app-id',
          appSecret: 'app-secret',
          groups: ['invalid'],
        },
      },
    }) as {
      channels: {
        feishu: {
          groups: Record<string, unknown>
        }
      }
    }

    expect(config.channels.feishu.groups).toEqual({})
  })

  it('preserves an explicit groups config', () => {
    const groups = {
      '*': {
        enabled: true,
        allowFrom: ['ou_123'],
      },
    }

    const config = normalizeFeishuPluginConfig({
      channels: {
        feishu: {
          appId: 'app-id',
          appSecret: 'app-secret',
          groups,
        },
      },
    }) as {
      channels: {
        feishu: {
          groups: typeof groups
        }
      }
    }

    expect(config.channels.feishu.groups).toEqual(groups)
  })

  it('returns the original config when feishu config is null', () => {
    const input = { channels: { feishu: null } as unknown as Record<string, unknown> }
    expect(normalizeFeishuPluginConfig(input)).toEqual(input)
  })

  it('preserves other top-level keys in pluginConfig', () => {
    const config = normalizeFeishuPluginConfig({
      channels: {
        feishu: {
          appId: 'app-id',
          appSecret: 'app-secret',
        },
      },
      someOtherPlugin: { key: 'value' },
    }) as Record<string, unknown>

    expect(config.someOtherPlugin).toEqual({ key: 'value' })
    expect((config.channels as Record<string, unknown>).feishu).toHaveProperty('groups')
  })
})