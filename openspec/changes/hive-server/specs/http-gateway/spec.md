## ADDED Requirements

### Requirement: HTTP server starts on configured port

The system SHALL start an HTTP server on the configured port (default 3000) when the server starts.

#### Scenario: Server starts with default port
- **WHEN** server starts without port configuration
- **THEN** HTTP server SHALL listen on port 3000

#### Scenario: Server starts with custom port
- **WHEN** server starts with PORT=8080 environment variable
- **THEN** HTTP server SHALL listen on port 8080

### Requirement: POST /api/chat endpoint processes messages

The system SHALL provide a POST /api/chat endpoint that accepts user messages and returns agent responses.

#### Scenario: Send message and receive response
- **WHEN** client sends POST /api/chat with body `{ "message": "Hello", "sessionId": "test-123" }`
- **THEN** system SHALL return `{ "response": "<agent response>", "sessionId": "test-123" }`

#### Scenario: Missing message returns error
- **WHEN** client sends POST /api/chat with empty body
- **THEN** system SHALL return 400 with error message

### Requirement: GET /api/sessions lists all sessions

The system SHALL provide a GET /api/sessions endpoint that returns all sessions.

#### Scenario: List sessions
- **WHEN** client sends GET /api/sessions
- **THEN** system SHALL return array of session objects with id, createdAt, updatedAt

### Requirement: GET /api/sessions/:id retrieves session details

The system SHALL provide a GET /api/sessions/:id endpoint that returns session details.

#### Scenario: Get existing session
- **WHEN** client sends GET /api/sessions/existing-id
- **THEN** system SHALL return session object with messages

#### Scenario: Get non-existent session
- **WHEN** client sends GET /api/sessions/nonexistent-id
- **THEN** system SHALL return 404

### Requirement: DELETE /api/sessions/:id deletes session

The system SHALL provide a DELETE /api/sessions/:id endpoint that deletes a session.

#### Scenario: Delete existing session
- **WHEN** client sends DELETE /api/sessions/existing-id
- **THEN** system SHALL return 204

### Requirement: GET /api/plugins lists loaded plugins

The system SHALL provide a GET /api/plugins endpoint that returns loaded plugins.

#### Scenario: List loaded plugins
- **WHEN** client sends GET /api/plugins
- **THEN** system SHALL return array of plugin info objects

### Requirement: Health check endpoint

The system SHALL provide GET /health endpoint for health checks.

#### Scenario: Health check returns OK
- **WHEN** client sends GET /health
- **THEN** system SHALL return `{ "status": "ok" }`
