/**
 * Test loading @larksuite/openclaw-lark plugin using OpenClaw's plugin SDK
 *
 * This script tests the plugin in the context where openclaw is available
 */

import { pathToFileURL } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

async function main() {
  console.log('Testing @larksuite/openclaw-lark plugin loading...\n')

  // First verify openclaw is available
  try {
    const openclaw = await import('openclaw')
    console.log('✓ openclaw package available')
    console.log('  Version:', openclaw.version || 'unknown')
  } catch (e) {
    console.error('✗ openclaw package not available:', (e as Error).message)
    console.log('\nTo use @larksuite/openclaw-lark, you need to install openclaw as a peer dependency.')
    process.exit(1)
  }

  // Now try to load the lark plugin
  try {
    const module = await import('@larksuite/openclaw-lark')
    const plugin = module.default || module

    console.log('\n✓ Plugin loaded successfully!')
    console.log('  ID:', plugin.id)
    console.log('  Name:', plugin.name)
    console.log('  Version:', plugin.version || 'unknown')
    console.log('  Description:', plugin.description)

    // Check for exports
    const exports = Object.keys(module).filter(k => k !== 'default')
    console.log('\n  Exported functions:', exports.slice(0, 10).join(', '), '...')

    // Check if it has register function
    if (typeof plugin.register === 'function') {
      console.log('\n  ✓ Has register() function')
    }

    process.exit(0)
  } catch (e) {
    console.error('\n✗ Failed to load plugin:')
    console.error((e as Error).message)
    console.error('\nStack:', (e as Error).stack)
    process.exit(1)
  }
}

main()
