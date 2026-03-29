## ADDED Requirements

### Requirement: LLM classifier safe default to chat
When the LLM classifier is uncertain about task classification, it SHALL default to the chat layer (not workflow), since chat is a single LLM call while workflow requires 3-10 calls.

#### Scenario: Greeting message classified as chat
- **WHEN** user sends "你好啊"
- **THEN** Dispatcher SHALL route to chat layer with confidence >= 0.7

#### Scenario: Casual conversation classified as chat
- **WHEN** user sends "今天天气怎么样"
- **THEN** Dispatcher SHALL route to chat layer

#### Scenario: Short message without action verbs classified as chat
- **WHEN** user sends "在吗" or "hello"
- **THEN** Dispatcher SHALL route to chat layer

### Requirement: LLM classifier prompt includes few-shot examples
The DISPATCH_SYSTEM_PROMPT SHALL include 6-8 few-shot examples covering greetings, casual conversation, Q&A, and code tasks in both Chinese and English.

#### Scenario: Chinese greeting example in prompt
- **WHEN** DISPATCH_SYSTEM_PROMPT is constructed
- **THEN** it SHALL contain at least one Chinese greeting example with expected output `{"layer":"chat",...}`

#### Scenario: Code task example in prompt
- **WHEN** DISPATCH_SYSTEM_PROMPT is constructed
- **THEN** it SHALL contain at least one code task example with expected output `{"layer":"workflow",...}`

### Requirement: WorkflowCapability short-circuits simple tasks
WorkflowCapability.analyzeTask() SHALL classify short messages (< 30 characters) without action verbs as simple tasks, skipping explore and plan phases entirely.

#### Scenario: Short greeting skips explore/plan
- **WHEN** analyzeTask() receives "你好啊" (4 characters, no action verbs)
- **THEN** it SHALL return `type: 'simple'` with `needsExploration: false` and `needsPlanning: false`

#### Scenario: Short casual message skips explore/plan
- **WHEN** analyzeTask() receives "谢谢" (2 characters)
- **THEN** it SHALL return `type: 'simple'`

#### Scenario: Short message with action verb still triggers complex workflow
- **WHEN** analyzeTask() receives "修复登录bug" (contains action verb "修复")
- **THEN** it SHALL return `type: 'moderate'` with `needsExploration: true`

#### Scenario: Long message defaults to moderate
- **WHEN** analyzeTask() receives a message >= 30 characters without action verbs
- **THEN** it SHALL return `type: 'moderate'` (existing behavior preserved)
