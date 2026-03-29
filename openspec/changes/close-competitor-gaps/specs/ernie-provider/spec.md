## ADDED Requirements

### Requirement: ERNIE provider preset detection
The system SHALL detect Baidu ERNIE (文心一言) API key from environment variable `ERNIE_API_KEY` and auto-create a provider configuration.

#### Scenario: ERNIE_API_KEY present in environment
- **WHEN** ERNIE_API_KEY is set in process.env
- **THEN** EnvironmentProviderSource SHALL include an ERNIE provider with baseUrl `https://aip.baidubce.com` and default model `ernie-4.0-8k`

#### Scenario: ERNIE_API_KEY absent
- **WHEN** ERNIE_API_KEY is not set
- **THEN** EnvironmentProviderSource SHALL NOT include ERNIE in available providers

### Requirement: ERNIE in provider registry
The provider registry SHALL include ERNIE metadata (name, baseUrl, defaultModel, envKeys).

#### Scenario: Provider registry has ERNIE entry
- **WHEN** system queries provider registry for 'ernie'
- **THEN** registry SHALL return `{ providerId: 'ernie', name: 'ERNIE (文心一言)', defaultModel: 'ernie-4.0-8k', envKeys: ['ERNIE_API_KEY'] }`
