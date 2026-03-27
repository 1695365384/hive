## ADDED Requirements

### Requirement: WebhookHandler interface
`packages/core/src/plugins/types.ts` SHALL define a `WebhookHandler` interface with a `handleWebhook` method. The method signature SHALL accept `body: unknown`, `signature?: string`, `timestamp?: string`, `nonce?: string` and return `Promise<unknown>`.

#### Scenario: Interface exists in plugin types
- **WHEN** importing from `@hive/core`
- **THEN** `WebhookHandler` interface SHALL be available as an exported type

### Requirement: Gateway uses WebhookHandler type
`apps/server/src/gateway/http.ts` SHALL NOT use `as any` to call `handleWebhook`. It SHALL use the `WebhookHandler` interface for type checking.

#### Scenario: No as any in gateway http handler
- **WHEN** `gateway/http.ts` processes webhook requests
- **THEN** `as any` SHALL NOT appear in the webhook dispatch code

### Requirement: Feishu plugin implements WebhookHandler
The feishu channel plugin SHALL implement the `WebhookHandler` interface.

#### Scenario: Feishu channel type safety
- **WHEN** the feishu plugin's `handleWebhook` is called
- **THEN** it SHALL conform to the `WebhookHandler` interface signature
