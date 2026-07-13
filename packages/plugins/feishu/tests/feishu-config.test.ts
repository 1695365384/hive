import { describe, it, expect } from 'vitest'
import { resolveFeishuDomain, isFeishuAppConfigValid } from '../src/feishu-config.js'
import * as lark from '@larksuiteoapi/node-sdk'

describe('feishu-config', () => {
  it('resolveFeishuDomain maps aliases', () => {
    expect(resolveFeishuDomain('feishu')).toBe(lark.Domain.Feishu)
    expect(resolveFeishuDomain('lark')).toBe(lark.Domain.Lark)
    expect(resolveFeishuDomain('https://open.larksuite.com')).toBe(lark.Domain.Lark)
  })

  it('isFeishuAppConfigValid rejects placeholders and disabled apps', () => {
    expect(isFeishuAppConfigValid({ appId: 'cli_real', appSecret: 'secret' })).toBe(true)
    expect(isFeishuAppConfigValid({ appId: 'your-app-id', appSecret: 'x' })).toBe(false)
    expect(isFeishuAppConfigValid({ appId: 'cli_x', appSecret: 'y', enabled: false })).toBe(false)
  })
})
