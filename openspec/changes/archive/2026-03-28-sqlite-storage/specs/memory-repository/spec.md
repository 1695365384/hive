## ADDED Requirements

### Requirement: Store memory entry

The system SHALL persist memory entries with key, value, tags, and timestamps.

#### Scenario: Store new memory
- **WHEN** memory is stored with new key
- **THEN** system inserts new row in memories table
- **AND** created_at and updated_at are set to current time

#### Scenario: Update existing memory
- **WHEN** memory is stored with existing key
- **THEN** system updates value and tags
- **AND** updated_at is set to current time
- **AND** created_at remains unchanged

### Requirement: Retrieve memory entry

The system SHALL retrieve memory entries by key.

#### Scenario: Get existing memory
- **WHEN** key exists in database
- **THEN** system returns MemoryEntry with value, tags, timestamps

#### Scenario: Get non-existent memory
- **WHEN** key does not exist
- **THEN** system returns null

### Requirement: List all memories

The system SHALL retrieve all stored memories.

#### Scenario: Get all memories
- **WHEN** getAll is called
- **THEN** system returns Record<string, MemoryEntry>
- **AND** empty object if no memories exist

### Requirement: Filter memories by tag

The system SHALL support querying memories by tag.

#### Scenario: Query by single tag
- **WHEN** getByTag is called with tag
- **THEN** system returns all memories containing that tag
- **AND** uses JSON contains query

#### Scenario: No matching memories
- **WHEN** getByTag is called with non-existent tag
- **THEN** system returns empty array

### Requirement: Delete memory entry

The system SHALL remove memory entries by key.

#### Scenario: Delete existing memory
- **WHEN** key exists
- **THEN** system deletes row
- **AND** system returns true

#### Scenario: Delete non-existent memory
- **WHEN** key does not exist
- **THEN** system returns false

### Requirement: Memory persistence across restarts

The system SHALL retain memories after process restart.

#### Scenario: Restart and retrieve
- **WHEN** process restarts
- **AND** memory repository is reinitialized
- **THEN** all previously stored memories are available
