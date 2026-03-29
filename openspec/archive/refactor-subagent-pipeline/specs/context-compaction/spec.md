## ADDED Requirements

### Requirement: Compress agent phase output into structured summary
The ContextCompactor SHALL accept a raw agent phase output (text) and produce a structured `AgentPhaseResult` containing summary, keyFiles, findings, and suggestions fields.

#### Scenario: Successful compression of explore phase output
- **WHEN** explore agent produces output containing file paths, code analysis, and findings
- **THEN** compactor returns AgentPhaseResult with summary (< 2000 chars), non-empty keyFiles array, and non-empty findings array

#### Scenario: Compression with minimal input
- **WHEN** agent output is very short (< 500 chars)
- **THEN** compactor returns AgentPhaseResult with summary equal to the raw input, and empty keyFiles/findings/suggestions

#### Scenario: Compression failure fallback
- **WHEN** LLM compression call fails or returns invalid JSON
- **THEN** compactor returns a fallback AgentPhaseResult with summary set to the raw text (truncated to 5000 chars) and empty arrays for other fields

### Requirement: Use cost-effective model for compression
The ContextCompactor SHALL use a low-cost model (haiku tier) for compression, configurable via `CompactorConfig.model`.

#### Scenario: Default model selection
- **WHEN** no model is specified in config
- **THEN** compactor uses the provider's lowest-cost available model

#### Scenario: Custom model override
- **WHEN** config specifies a model ID
- **THEN** compactor uses the specified model for compression

### Requirement: Preserve raw text for debugging
The ContextCompactor SHALL optionally preserve the raw phase output in the `rawText` field of AgentPhaseResult when `preserveRaw` is enabled.

#### Scenario: Raw text preservation enabled
- **WHEN** compactor is configured with `preserveRaw: true`
- **THEN** AgentPhaseResult.rawText contains the complete original output

#### Scenario: Raw text preservation disabled (default)
- **WHEN** compactor is configured with `preserveRaw: false` or not specified
- **THEN** AgentPhaseResult.rawText is an empty string

### Requirement: Structured result format for phase handoff
The `AgentPhaseResult` interface SHALL be the standard data structure passed between workflow phases, replacing raw string concatenation.

#### Scenario: Explore to Plan handoff
- **WHEN** explore phase completes and plan phase begins
- **THEN** plan phase receives AgentPhaseResult (not raw string) containing compressed summary and key files discovered

#### Scenario: Plan to Execute handoff
- **WHEN** plan phase completes and execute phase begins
- **THEN** execute phase receives AgentPhaseResult containing the execution plan summary and specific file change suggestions
