/**
 * Test script to verify OpenClaw adapter can load @larksuite/openclaw-lark plugin
 */

import { createRequire } from 'module'
import { pathToFileURL } from 'url'
import { OpenClawPluginLoader } from '@hive/openclaw-adapter'

const require = createRequire(import.meta.url)

// Load the plugin using require (CommonJS)
const pluginModule = require('@larksuite/openclaw-lark')
const plugin = pluginModule.default || pluginModule

console.log('=== Testing OpenClaw Adapter with Lark Plugin ===\n')

// Create mock message bus
const mockMessageBus = {
  subscribe: (topic, handler) => {
    console.log(`[MockMessageBus] Subscribed to: ${topic}`)
    return `sub-${Date.now()}`
  },
  unsubscribe: (subId) => {
    console.log(`[MockMessageBus] Unsubscribed: ${subId}`)
    return true
  },
  publish: async (topic, message) => {
    console.log(`[MockMessageBus] Published to ${topic}:`, message)
  }
}

// Create mock logger
const mockLogger = {
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args),
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args)
}

console.log('Plugin info:')
console.log('  - ID:', plugin.id)
console.log('  - Name:', plugin.name)
console.log('  - Description:', plugin.description)
console.log('')

// Create adapter
const loader = new OpenClawPluginLoader(plugin, {
  messageBus: mockMessageBus,
  logger: mockLogger,
  source: 'npm:@larksuite/openclaw-lark'
})

console.log('Loading plugin...')
try {
  await loader.load()
  console.log('✓ Plugin loaded successfully!\n')

  const info = loader.getInfo()
  console.log('Plugin state:', info.state)
  console.log('')

  // Get channels
  const channels = loader.getChannels()
  console.log(`Registered channels: ${channels.length}`)
  channels.forEach(ch => {
    console.log(`  - ${ch.id}: ${ch.name || 'unnamed'}`)
    if (ch.capabilities) {
      console.log(`    Capabilities:`, ch.capabilities)
    }
  })
  console.log('')

  // Get tools
  const tools = loader.getTools()
  console.log(`Registered tools: ${tools.length}`)
  if (tools.length > 0) {
    tools.slice(0, 5).forEach(tool => {
      const t = tool
      console.log(`  - ${t.name || 'unnamed'}: ${t.description || 'no description'}`)
    })
    if (tools.length > 5) {
      console.log(`  ... and ${tools.length - 5} more`)
    }
  }
  console.log('')

  // Get hooks
  const hooks = loader.getHooks()
  console.log(`Registered hooks: ${hooks.size}`)
  hooks.forEach((entry, hookName) => {
    console.log(`  - ${hookName}`)
  })
  console.log('')

  // Activate plugin
  console.log('Activating plugin...')
  await loader.activate()
  console.log('✓ Plugin activated successfully!\n')

  console.log('=== Test PASSED ===')
  process.exit(0)
} catch (error) {
  console.error('✗ Test FAILED:', error)
  console.error(error.stack)
  process.exit(1)
}
