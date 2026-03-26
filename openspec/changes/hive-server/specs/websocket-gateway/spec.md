## ADDED Requirements

### Requirement: WebSocket server accepts connections

The system SHALL accept WebSocket connections on the same port as HTTP server at /ws path.

#### Scenario: Client connects successfully
- **WHEN** client connects to ws://localhost:3000/ws
- **THEN** connection SHALL be established

### Requirement: WebSocket receives and responds to chat messages

The system SHALL process incoming JSON messages and respond with agent replies.

#### Scenario: Send message via WebSocket
- **WHEN** client sends `{ "type": "chat", "message": "Hello", "sessionId": "test-123" }`
- **THEN** system SHALL respond with `{ "type": "response", "message": "<agent response>", "sessionId": "test-123" }`

### Requirement: WebSocket supports streaming responses

The system SHALL support streaming responses for long agent replies.

#### Scenario: Streaming response
- **WHEN** client sends `{ "type": "chat", "message": "Long question", "stream": true }`
- **THEN** system SHALL send multiple `{ "type": "chunk", "content": "..." }` messages followed by `{ "type": "done" }`

### Requirement: WebSocket broadcasts plugin events

The system SHALL broadcast plugin events to connected clients.

#### Scenario: Plugin event broadcast
- **WHEN** a plugin emits an event (e.g., message received from channel)
- **THEN** system SHALL broadcast `{ "type": "event", "event": "...", "data": {...} }` to all connected clients

### Requirement: WebSocket handles connection errors gracefully

The system SHALL handle connection errors and provide meaningful error messages.

#### Scenario: Invalid message format
- **WHEN** client sends invalid JSON
- **THEN** system SHALL respond with `{ "type": "error", "message": "Invalid message format" }`

### Requirement: WebSocket supports session management

The system SHALL allow clients to create and join sessions.

#### Scenario: Create new session
- **WHEN** client sends `{ "type": "session:create" }`
- **THEN** system SHALL respond with `{ "type": "session:created", "sessionId": "<new-id>" }`

#### Scenario: Join existing session
- **WHEN** client sends `{ "type": "session:join", "sessionId": "existing-id" }`
- **THEN** system SHALL respond with `{ "type": "session:joined", "sessionId": "existing-id" }`
