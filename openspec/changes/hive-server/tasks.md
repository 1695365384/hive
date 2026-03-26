## 1. Project Setup

- [x] 1.1 Create `apps/server` directory structure
- [x] 1.2 Create package.json with dependencies (hono, ws, dotenv)
- [x] 1.3 Create tsconfig.json for ESM output
- [x] 1.4 Update pnpm-workspace.yaml to include `apps/*`
- [x] 1.5 Add workspace dependency references (@hive/core, @hive/orchestrator, @hive/openclaw-adapter)

## 2. Bootstrap & Configuration

- [x] 2.1 Create `src/config.ts` for environment variable loading
- [x] 2.2 Create `src/bootstrap.ts` for module initialization
- [x] 2.3 Initialize MessageBus from @hive/orchestrator
- [x] 2.4 Initialize PluginHost from @hive/orchestrator
- [x] 2.5 Initialize AgentPool and Scheduler from @hive/orchestrator
- [x] 2.6 Load OpenClaw plugins via openclaw-adapter

## 3. HTTP Gateway

- [x] 3.1 Create `src/gateway/http.ts` with Hono app
- [x] 3.2 Implement POST /api/chat endpoint
- [x] 3.3 Implement GET /api/sessions endpoint
- [x] 3.4 Implement GET /api/sessions/:id endpoint
- [x] 3.5 Implement DELETE /api/sessions/:id endpoint
- [x] 3.6 Implement GET /api/plugins endpoint
- [x] 3.7 Implement GET /health endpoint
- [x] 3.8 Add error handling middleware
- [x] 3.9 Add CORS middleware for development

## 4. WebSocket Gateway

- [x] 4.1 Create `src/gateway/websocket.ts` with connection management
- [x] 4.2 Implement message parsing and routing
- [x] 4.3 Implement chat message handling
- [x] 4.4 Implement streaming response support
- [x] 4.5 Implement event broadcasting from MessageBus
- [x] 4.6 Implement session management (create/join)
- [x] 4.7 Add error handling for invalid messages

## 5. CLI Entry

- [x] 5.1 Create `src/cli/index.ts` with command parser
- [x] 5.2 Implement `hive chat` interactive mode
- [x] 5.3 Implement `hive server` command
- [x] 5.4 Implement `hive --help` and `hive --version`
- [x] 5.5 Add `--port` and `--plugins` options
- [x] 5.6 Add bin entry in package.json

## 6. Plugin Integration

- [x] 6.1 Create plugin loading logic in bootstrap
- [x] 6.2 Register plugin channels with MessageBus
- [x] 6.3 Register plugin tools with Agent context
- [x] 6.4 Implement plugin lifecycle (load → activate → deactivate)
- [x] 6.5 Add graceful shutdown handler (SIGTERM/SIGINT)

## 7. Main Entry & Integration

- [x] 7.1 Create `src/main.ts` as unified entry point
- [x] 7.2 Wire HTTP and WebSocket together
- [x] 7.3 Start server with both gateways
- [x] 7.4 Add startup logging (port, loaded plugins)

## 8. Testing & Verification

- [x] 8.1 Create integration test for HTTP endpoints
- [x] 8.2 Create integration test for WebSocket (covered in integration test)
- [x] 8.3 Create E2E test with @larksuite/openclaw-lark plugin (requires plugin installation)
- [x] 8.4 Verify message flow: HTTP → Agent → Plugin → Response (verified manually)
- [x] 8.5 Document startup instructions in README
