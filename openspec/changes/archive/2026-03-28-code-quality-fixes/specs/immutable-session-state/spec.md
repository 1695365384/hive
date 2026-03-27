## ADDED Requirements

### Requirement: Session state mutations produce new objects
SessionManager SHALL NOT modify session objects in place. All state-changing operations SHALL return new objects using spread operators or structuredClone.

#### Scenario: addMessage creates new session object
- **WHEN** addMessage() is called with a valid message
- **THEN** the previous session object SHALL remain unchanged
- **AND** the new session object SHALL contain the added message

#### Scenario: save updates reference immutably
- **WHEN** save() is called after state changes
- **THEN** the session reference SHALL be updated to a new object
- **AND** the previous reference SHALL not reflect the changes

### Requirement: Messages array is never mutated
The messages array of a session SHALL never be modified using push, splice, or direct index assignment. New message arrays SHALL be created using spread syntax.

#### Scenario: Original messages array unchanged after addMessage
- **WHEN** a message is added to a session
- **THEN** `session.messages` SHALL be a new array reference
- **AND** the old array reference SHALL not contain the new message

### Requirement: Session metadata is updated immutably
Metadata fields (totalTokens, messageCount, etc.) SHALL be updated by creating new metadata objects, not by modifying existing ones.

#### Scenario: totalTokens updated immutably
- **WHEN** a message with tokenCount is added
- **THEN** a new metadata object SHALL be created with updated totalTokens
- **AND** the previous metadata object SHALL retain its original values
