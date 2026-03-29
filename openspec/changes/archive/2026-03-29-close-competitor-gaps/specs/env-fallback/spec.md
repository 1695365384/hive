## MODIFIED Requirements

### Requirement: Chinese LLM parameter adaptation
The openai-compatible adapter SHALL preprocess request parameters for known Chinese LLM providers to avoid API errors.

#### Scenario: GLM strips reasoning_effort parameter
- **WHEN** request targets a GLM model and includes `reasoning_effort` parameter
- **THEN** the adapter SHALL remove `reasoning_effort` from the request body before sending

#### Scenario: Kimi adapts stream format
- **WHEN** request targets a Kimi model with streaming enabled
- **THEN** the adapter SHALL ensure stream parameter format matches Moonshot API expectations

#### Scenario: Unknown provider passes through unchanged
- **WHEN** request targets a provider not in the known adaptation list
- **THEN** the adapter SHALL pass all parameters unchanged

### Requirement: ERNIE environment variable detection
EnvironmentProviderSource SHALL scan for ERNIE_API_KEY alongside existing Chinese LLM keys.

#### Scenario: Five Chinese LLMs detected simultaneously
- **WHEN** GLM_API_KEY, DEEPSEEK_API_KEY, QWEN_API_KEY, KIMI_API_KEY, ERNIE_API_KEY are all set
- **THEN** EnvironmentProviderSource SHALL return all 5 providers in available providers list
