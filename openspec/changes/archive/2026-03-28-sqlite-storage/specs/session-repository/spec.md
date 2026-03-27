## ADDED Requirements

### Requirement: Save session

The system SHALL persist session data including messages and metadata to SQLite.

#### Scenario: Save new session
- **WHEN** session is saved for the first time
- **THEN** system inserts new row in sessions table
- **AND** system inserts all messages in messages table
- **AND** updated_at timestamp is set

#### Scenario: Update existing session
- **WHEN** session with same ID is saved again
- **THEN** system updates existing session row
- **AND** system replaces all messages for that session
- **AND** updated_at timestamp is updated

### Requirement: Load session

The system SHALL retrieve session data by ID with all messages.

#### Scenario: Load existing session
- **WHEN** session ID exists in database
- **THEN** system returns complete Session object
- **AND** messages are ordered by sequence number
- **AND** dates are parsed to Date objects

#### Scenario: Load non-existent session
- **WHEN** session ID does not exist
- **THEN** system returns null

### Requirement: Delete session

The system SHALL remove session and all associated messages.

#### Scenario: Delete existing session
- **WHEN** session ID exists
- **THEN** system deletes session row
- **AND** system deletes all associated messages (CASCADE)
- **AND** system returns true

#### Scenario: Delete non-existent session
- **WHEN** session ID does not exist
- **THEN** system returns false

### Requirement: List sessions

The system SHALL list sessions with pagination and filtering.

#### Scenario: List all sessions in group
- **WHEN** list is called with group name
- **THEN** system returns sessions in that group only
- **AND** sessions are sorted by updated_at descending

#### Scenario: List sessions across all groups
- **WHEN** list is called without group filter
- **THEN** system returns sessions from all groups
- **AND** each session includes group_name

### Requirement: Query sessions by time range

The system SHALL support filtering sessions by creation or update time.

#### Scenario: Filter by update time
- **WHEN** list is called with since parameter
- **THEN** system returns only sessions updated after that time

### Requirement: Session statistics

The system SHALL provide aggregate statistics for sessions.

#### Scenario: Get session count
- **WHEN** stats are requested
- **THEN** system returns total session count
- **AND** system returns total message count
- **AND** system returns total token count
