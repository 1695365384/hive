## MODIFIED Requirements

### Requirement: Sub-agent tool restriction by phase
explore and plan sub-agents SHALL be restricted to read-only tools via SDK `tools` parameter (not prompt-level suggestion).

#### Scenario: Explore agent cannot call Write
- **WHEN** SubAgentCapability.explore() calls runner.execute('explore', prompt)
- **THEN** runner.execute() SHALL pass `tools: ['Read', 'Glob', 'Grep']` to the SDK, excluding Write, Edit, Bash

#### Scenario: Plan agent cannot call Write
- **WHEN** SubAgentCapability.plan() calls runner.execute('plan', prompt)
- **THEN** runner.execute() SHALL pass `tools: ['Read', 'Glob', 'Grep']` to the SDK

#### Scenario: General agent has full tools
- **WHEN** SubAgentCapability.general() calls runner.execute('general', prompt)
- **THEN** runner.execute() SHALL pass the full tool list including Write, Edit, Bash

#### Scenario: Custom tools override
- **WHEN** caller provides `options.tools` array
- **THEN** the provided tools SHALL take precedence over the default agent tools

### Requirement: Workflow auto-compression between phases
WorkflowCapability SHALL automatically trigger context compression between workflow phases when message count exceeds threshold.

#### Scenario: Compression triggered after explore phase
- **WHEN** explore phase completes and session message count exceeds CompressionService threshold
- **THEN** WorkflowCapability SHALL call sessionManager.compressIfNeeded() before building plan prompt

#### Scenario: Compression triggered after plan phase
- **WHEN** plan phase completes and session message count exceeds threshold
- **THEN** WorkflowCapability SHALL call sessionManager.compressIfNeeded() before building execute prompt

#### Scenario: No compression when under threshold
- **WHEN** message count is below CompressionService.needsCompression() threshold
- **THEN** WorkflowCapability SHALL NOT trigger compression
