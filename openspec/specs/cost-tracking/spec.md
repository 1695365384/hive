## ADDED Requirements

### Requirement: Token usage collection per dispatch
Dispatcher SHALL collect token usage (input/output) from each execution phase and aggregate into DispatchResult.

#### Scenario: Chat layer returns usage
- **WHEN** dispatch routes to chat layer and SDK returns usage data
- **THEN** DispatchResult.usage SHALL contain `{ input: number, output: number }`

#### Scenario: Workflow layer aggregates usage across phases
- **WHEN** dispatch routes to workflow and executes explore→plan→execute
- **THEN** DispatchResult.usage SHALL contain summed input/output across all phases

### Requirement: Cost estimation based on model pricing
The system SHALL estimate USD cost based on model pricing table and token usage.

#### Scenario: Chat with Haiku model
- **WHEN** dispatch uses claude-haiku-4-5 and consumes 1000 input + 500 output tokens
- **THEN** DispatchResult.cost SHALL contain `{ input: 0.00025, output: 0.00125, total: 0.0015 }` (example rates)

#### Scenario: Cost field absent when usage unavailable
- **WHEN** SDK does not return usage data
- **THEN** DispatchResult.cost SHALL be undefined (not zero)

### Requirement: Model pricing table
The system SHALL maintain a pricing table for supported models in `providers/metadata/`.

#### Scenario: Pricing table includes core models
- **WHEN** system initializes
- **THEN** pricing table SHALL include entries for claude-haiku-4-5, claude-sonnet-4-6, deepseek-chat, glm-4-flash at minimum

#### Scenario: Unknown model returns null cost
- **WHEN** execution uses a model not in the pricing table
- **THEN** cost estimation SHALL return null for that phase
