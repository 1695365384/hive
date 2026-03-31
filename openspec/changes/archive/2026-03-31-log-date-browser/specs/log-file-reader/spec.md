## ADDED Requirements

### Requirement: List available log dates
The server SHALL provide a `log.listDates` WS method that returns all dates with existing log files in the log directory.

#### Scenario: Multiple log files exist
- **WHEN** `log.listDates` is called and `~/.hive/logs/` contains `hive-2026-03-30.log` and `hive-2026-03-31.1.log`
- **THEN** the response SHALL be `["2026-03-30", "2026-03-31"]`

#### Scenario: No log files exist
- **WHEN** `log.listDates` is called and the log directory is empty
- **THEN** the response SHALL be `[]`

### Requirement: Read logs by date
The server SHALL provide a `log.getByDate` WS method that reads and parses log entries from log files for a given date.

#### Scenario: Read logs for a specific date
- **WHEN** `log.getByDate({ date: "2026-03-31" })` is called
- **THEN** the server SHALL read all `hive-2026-03-31*.log` files, parse each JSON line, and return up to `limit` entries (default 200) as `LogEntry[]`

#### Scenario: Pagination support
- **WHEN** `log.getByDate({ date: "2026-03-31", limit: 100, offset: 200 })` is called
- **THEN** the server SHALL skip the first 200 entries and return the next 100

#### Scenario: Invalid date format
- **WHEN** `log.getByDate({ date: "not-a-date" })` is called
- **THEN** the server SHALL return an error response

### Requirement: Date picker in log drawer
The desktop log drawer SHALL include a date selector that allows switching between "today" (real-time) and historical dates.

#### Scenario: Select a historical date
- **WHEN** user selects a date other than today
- **THEN** real-time polling SHALL pause and logs for the selected date SHALL be displayed

#### Scenario: Select today
- **WHEN** user selects today from the date picker
- **THEN** real-time polling SHALL resume and the log view SHALL switch back to live mode
