# @bundy-lmw/hive-core

Hive - Multi-Agent Collaboration Framework. Like bees collaborating efficiently, an AI Agent SDK.

## Features

- **Multi-Provider Support** - OpenAI, Anthropic, DeepSeek, Google, Mistral, xAI, and any OpenAI-compatible API
- **Agent System** - Explore / Plan / General sub-agents with tool delegation
- **Plugin System** - Extensible plugin architecture with channel abstraction
- **Session Persistence** - SQLite-based session storage
- **Built-in Tools** - Bash, File, Glob, Grep, Web Search, Web Fetch, Ask User
- **Hooks** - Lifecycle event hooks for tool calls, capabilities, and workflows
- **Skills** - Markdown-based skill definitions with YAML frontmatter
- **Message Bus** - Pub/sub event system for inter-component communication
- **Schedule Engine** - Cron-based task scheduling with push notifications

## Quick Start

```bash
npm install @bundy-lmw/hive-core
```

```typescript
import { Agent } from '@bundy-lmw/hive-core'

const agent = new Agent({
  provider: {
    id: 'glm',
    apiKey: process.env.GLM_API_KEY!,
    model: 'glm-4-flash',
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
  },
})

const result = await agent.dispatch('Hello, world!')
console.log(result.text)
```

## Documentation

Full documentation: [hive/README.md](https://github.com/1695365384/hive/blob/main/README.md)

## License

MIT
