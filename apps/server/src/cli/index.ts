#!/usr/bin/env node

/**
 * Hive CLI Entry
 *
 * Command-line interface for Hive server.
 */

import { Command } from 'commander'
import { createPluginCommand } from '../plugin-manager/cli.js'
import { createSkillCommand } from './commands/skill/index.js'

const VERSION = '1.0.0'

const program = new Command()
  .name('hive')
  .description('Hive - Multi-Agent Collaboration Framework')
  .version(VERSION)

// hive chat
program
  .command('chat')
  .description('Start interactive chat mode')
  .action(async () => {
    const { createInterface } = await import('readline')

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    console.log('Hive Chat - Type /exit to quit\n')

    const { bootstrap } = await import('../bootstrap.js')
    const { getConfig } = await import('../config.js')
    const cfg = getConfig()
    const ctx = await bootstrap({ config: { ...cfg, plugins: [] } })

    const prompt = () => {
      rl.question('You: ', async (input) => {
        const trimmed = input.trim()

        if (trimmed === '/exit' || trimmed === '/quit') {
          console.log('Goodbye!')
          rl.close()
          process.exit(0)
        }

        if (!trimmed) {
          prompt()
          return
        }

        try {
          const response = await ctx.agent.chat(trimmed)
          console.log(`\nAgent: ${response}\n`)
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : 'Unknown error')
        }

        prompt()
      })
    }

    prompt()
  })

// hive server
program
  .command('server')
  .description('Start HTTP/WebSocket server')
  .option('-p, --port <port>', 'Server port', undefined)
  .action(async (options: { port?: string }) => {
    const { getConfig } = await import('../config.js')
    const cfg = getConfig()
    const serverPort = options.port ? parseInt(options.port, 10) : cfg.port

    console.log(`Starting Hive server on port ${serverPort}...`)

    const serverConfig = { ...cfg, port: serverPort }

    const { bootstrap } = await import('../bootstrap.js')
    const ctx = await bootstrap({ config: serverConfig })

    const { createServer } = await import('http')
    const { createHttpGateway } = await import('../gateway/http.js')

    const app = createHttpGateway(ctx)

    const server = createServer()
    const { createWebSocketGateway } = await import('../gateway/websocket.js')
    createWebSocketGateway(server, ctx)

    server.on('request', async (req, res) => {
      try {
        const url = `http://${req.headers.host || 'localhost'}${req.url}`
        const headers = new Headers()
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) {
            headers.set(key, Array.isArray(value) ? value.join(', ') : value)
          }
        }

        let body: string | undefined
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(chunk)
          }
          body = Buffer.concat(chunks).toString()
        }

        const request = new Request(url, {
          method: req.method,
          headers,
          body,
        })

        const response = await app.fetch(request)

        res.statusCode = response.status
        response.headers.forEach((value, key) => {
          res.setHeader(key, value)
        })
        const buffer = await response.arrayBuffer()
        res.end(Buffer.from(buffer))
      } catch (err) {
        console.error('[server] Request error:', err)
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    })

    server.listen(serverPort, () => {
      console.log(`\n✓ Hive server running at http://localhost:${serverPort}`)
      console.log(`  - HTTP API: http://localhost:${serverPort}/api`)
      console.log(`  - WebSocket: ws://localhost:${serverPort}/ws`)
      console.log(`  - Health: http://localhost:${serverPort}/health`)
      console.log()
    })
  })

// hive plugin
program.addCommand(createPluginCommand())

// hive skill
program.addCommand(createSkillCommand())

export async function main(): Promise<void> {
  program.parse()
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
