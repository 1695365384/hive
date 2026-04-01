## ADDED Requirements

### Requirement: Unified task dispatch entry point
Agent SHALL expose a single `dispatch(task, options?)` method as the sole task execution entry point. The method SHALL return a `DispatchResult` containing text, success status, tool calls, duration, and optional cost.

#### Scenario: Server dispatches a chat message
- **WHEN** Server calls `agent.dispatch(task, { chatId, onText, onToolCall, onToolResult })`
- **THEN** ExecutionCapability builds system prompt from `intelligent.md`, injects environment context, schedule summary, and tool descriptions
- **AND** the full tool set (bash, file, glob, grep, web-search, web-fetch, ask-user, send-file) plus subagent tools (explore, plan) are available
- **AND** LLM response streams via `onText` callback
- **AND** session is automatically persisted with user message and assistant response

#### Scenario: CLI dispatches with forceMode
- **WHEN** CLI calls `agent.dispatch(task, { forceMode: 'explore' })`
- **THEN** ExecutionCapability uses `explore.md` as base template
- **AND** only read-only tools are provided (file readonly, glob, grep, web-search, web-fetch)
- **AND** subagent tools are NOT injected (explore agent does not delegate)

#### Scenario: CLI dispatches with forceMode plan
- **WHEN** CLI calls `agent.dispatch(task, { forceMode: 'plan' })`
- **THEN** ExecutionCapability uses `plan.md` as base template
- **AND** only read-only tools are provided
- **AND** subagent tools are NOT injected

#### Scenario: CLI dispatches without forceMode
- **WHEN** CLI calls `agent.dispatch(task)` without forceMode
- **THEN** behavior is identical to Server dispatch (full tools + subagent tools + intelligent.md)

### Requirement: Backward-compatible chat alias
Agent SHALL provide `chat(prompt, options?)` as an alias for `dispatch(prompt, options)`, preserving the existing method signature and return type.

#### Scenario: Server uses existing chat() method
- **WHEN** Server calls `agent.chat(prompt, { onText, onToolCall })`
- **THEN** the call is delegated to `dispatch()` internally
- **AND** return value is the response text string (matching current chat() return type)

### Requirement: Dynamic tool set based on forceMode
ExecutionCapability SHALL select tools based on `forceMode`:
- `undefined` (normal): all general tools + subagent tools
- `'explore'` / `'plan'`: read-only tools only, no subagent tools

#### Scenario: Normal mode includes subagent tools
- **WHEN** dispatch is called without forceMode
- **THEN** the LLM receives `explore` and `plan` as available tools in addition to all general tools

#### Scenario: Forced mode excludes subagent tools
- **WHEN** dispatch is called with `forceMode: 'explore'`
- **THEN** the LLM does NOT receive `explore` or `plan` as available tools

### Requirement: Session management during dispatch
ExecutionCapability SHALL support session persistence via `chatId` parameter. When provided, the session SHALL be loaded before execution. On success, user message and assistant response SHALL be persisted.

#### Scenario: Dispatch with chatId persists conversation
- **WHEN** dispatch is called with `chatId: 'session-123'`
- **THEN** session 'session-123' is loaded before LLM execution
- **AND** upon successful response, the user message and assistant text are saved to the session

#### Scenario: Dispatch without chatId uses current session
- **WHEN** dispatch is called without chatId
- **THEN** the current active session (if any) is used for history context
- **AND** no new session is created

### Requirement: Streaming callbacks
ExecutionCapability SHALL support streaming via `onText`, `onToolCall`, `onToolResult`, and `onReasoning` callbacks, matching the current interface.

#### Scenario: Streaming text chunks
- **WHEN** LLM generates text tokens
- **THEN** each text chunk is delivered via `onText` callback
- **AND** the final accumulated text is returned in DispatchResult.text

#### Scenario: Tool call events
- **WHEN** LLM calls a tool
- **THEN** `onToolCall` fires before execution
- **AND** `onToolResult` fires after execution with the result

### Requirement: Heartbeat and timeout integration
ExecutionCapability SHALL start heartbeat monitoring at dispatch start and stop on completion or error, consistent with current WorkflowCapability behavior.

#### Scenario: Heartbeat runs during execution
- **WHEN** dispatch is executing
- **THEN** heartbeat is active
- **AND** activity is updated on each tool result to prevent stall timeout

### Requirement: Hook events
ExecutionCapability SHALL emit `workflow:phase` hooks at the same lifecycle points as current WorkflowCapability: start → execute → complete/error.

#### Scenario: Phase hooks fire during dispatch
- **WHEN** dispatch starts execution
- **THEN** `workflow:phase` hook fires with phase='execute'
- **WHEN** dispatch completes successfully
- **THEN** `workflow:phase` hook fires with phase='complete'
- **WHEN** dispatch fails
- **THEN** `workflow:phase` hook fires with phase='error'

### Requirement: External systemPrompt override
ExecutionCapability SHALL support `options.systemPrompt` to provide a complete system prompt, bypassing automatic construction. When provided, environment/schedule/tools sections SHALL be appended to the external prompt.

#### Scenario: External prompt with extras appended
- **WHEN** dispatch is called with `systemPrompt: 'You are a helpful assistant.'`
- **THEN** the final system prompt starts with the external prompt
- **AND** environment context, schedule summary, and tool descriptions are appended after it

### Requirement: Deleted public methods
Agent SHALL NOT expose `explore()`, `plan()`, `general()`, `runSubAgent()`, or `runWorkflow()` as public methods.

#### Scenario: Old methods not accessible
- **WHEN** external code attempts to call `agent.explore()` or `agent.runWorkflow()`
- **THEN** TypeScript compiler reports the method does not exist
