#!/usr/bin/env node

/**
 * Hive CLI Entry
 *
 * Command-line interface for Hive server.
 */

import { config } from '../config.js'

const VERSION = '1.0.0'

interface CliOptions {
  command: 'chat' | 'server' | 'help' | 'version'
  port?: number
  plugins?: string[]
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    command: 'help',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--help' || arg === '-h') {
      options.command = 'help'
      continue
    }

    if (arg === '--version' || arg === '-v') {
      options.command = 'version'
      continue
    }

    if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10)
      continue
    }

    if (arg === '--plugins') {
      options.plugins = args[++i]?.split(',').map((s) => s.trim()) || []
      continue
    }

    // Commands
    if (arg === 'chat') {
      options.command = 'chat'
      continue
    }

    if (arg === 'server') {
      options.command = 'server'
      continue
    }
  }

  return options
}

function showHelp(): void {
  console.log(`
Hive - Multi-Agent Collaboration Framework

Usage:
  hive <command> [options]

Commands:
  chat              Start interactive chat mode
  server            Start HTTP/WebSocket server

Options:
  --port, -p <port>      Server port (default: 3000)
  --plugins <plugins>    Comma-separated list of plugins to load
  --help, -h             Show this help message
  --version, -v          Show version number

Examples:
  hive chat
  hive server --port 8080
  hive server --plugins @larksuite/openclaw-lark
`)
}

function showVersion(): void {
  console.log(`hive v${VERSION}`)
}

async function runChat(): Promise<void> {
  const { createInterface } = await import('readline')

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('Hive Chat - Type /exit to quit\n')

  // Bootstrap agent
  const { bootstrap } = await import('../bootstrap.js')
  const ctx = await bootstrap({ config: { ...config, plugins: [] } })

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
}

async function runServer(port?: number, plugins?: string[]): Promise<void> {
  const serverPort = port || config.port
  const serverPlugins = plugins || config.plugins

  console.log(`Starting Hive server on port ${serverPort}...`)

  // Update config with CLI options
  const serverConfig = {
    ...config,
    port: serverPort,
    plugins: serverPlugins,
  }

  // Bootstrap
  const { bootstrap } = await import('../bootstrap.js')
  const ctx = await bootstrap({ config: serverConfig })

  // Start HTTP server with Hono
  const { createServer } = await import('http')
  const { createHttpGateway } = await import('../gateway/http.js')

  const app = createHttpGateway(ctx)

  // Setup WebSocket
  const server = createServer()
  const { createWebSocketGateway } = await import('../gateway/websocket.js')
  createWebSocketGateway(server, ctx)

  // Use Hono's Node.js adapter
  server.on('request', async (req, res) => {
    // Simple request handling via Hono
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
    console.log(`Loaded plugins: ${ctx.openClawPlugins.length}`)
    ctx.openClawPlugins.forEach((p) => {
      console.log(`  - ${p.getInfo().definition.name}`)
    })
  })
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2) // Skip 'node' and script path
  const options = parseArgs(args)

  switch (options.command) {
    case 'help':
      showHelp()
      break

    case 'version':
      showVersion()
      break

    case 'chat':
      await runChat()
      break

    case 'server':
      await runServer(options.port, options.plugins)
      break
  }
}

// Auto-run if executed directly
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
