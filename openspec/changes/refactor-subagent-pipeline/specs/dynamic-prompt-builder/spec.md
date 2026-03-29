## ADDED Requirements

### Requirement: Build system prompt from base template and phase context
The DynamicPromptBuilder SHALL construct a system prompt by combining: (1) base role template loaded from .md file, (2) current task description, (3) structured context from prior phase results (AgentPhaseResult).

#### Scenario: Build prompt for plan phase after explore
- **WHEN** building prompt for plan phase with explore result containing keyFiles and findings
- **THEN** generated prompt includes base plan.md template content, task description, and a formatted section listing key files and findings from explore phase

#### Scenario: Build prompt for execute phase after plan
- **WHEN** building prompt for execute phase with both explore and plan results
- **THEN** generated prompt includes intelligent.md template, task, explore findings summary, and plan suggestions

#### Scenario: Build prompt with no prior phase results
- **WHEN** building prompt for the first phase (explore) with no prior results
- **THEN** generated prompt includes only the base template and task description

### Requirement: Format phase results as contextual sections
The DynamicPromptBuilder SHALL format AgentPhaseResult fields into clearly labeled markdown sections (e.g., `## Explore Findings`, `## Key Files`) injected into the system prompt.

#### Scenario: Key files formatting
- **WHEN** AgentPhaseResult.keyFiles contains `["src/auth.ts", "src/user.ts"]`
- **THEN** prompt includes a section like `### Key Files\n- src/auth.ts\n- src/user.ts`

#### Scenario: Findings formatting
- **WHEN** AgentPhaseResult.findings contains multiple entries
- **THEN** each finding is listed as a bullet point under a `### Findings` section

### Requirement: Respect token budget for context injection
The DynamicPromptBuilder SHALL enforce a configurable token budget for injected phase context, truncating lower-priority sections (rawText, detailed findings) when budget is exceeded.

#### Scenario: Context within budget
- **WHEN** total injected context is under the token budget
- **THEN** all sections are included in full

#### Scenario: Context exceeds budget
- **WHEN** total injected context would exceed the token budget
- **THEN** detailed findings are truncated first, then suggestions, while keyFiles and summary are preserved

### Requirement: Auto-detect available tools from agent config
The DynamicPromptBuilder SHALL NOT include tool descriptions in the system prompt, as tool definitions are already provided to the LLM via the AI SDK tools parameter.

#### Scenario: Tool descriptions not duplicated
- **WHEN** building a prompt for an agent with Glob, Grep, Read tools
- **THEN** the system prompt does not contain tool usage instructions or tool descriptions
