/**
 * Bridge Hive ProviderManager → oh-my-pi AuthStorage / ModelRegistry / Model.
 *
 * Runtime loads pi via dynamic import so Node/vitest never
 * statically evaluate the Bun-oriented package.
 */

import type { ProviderManager } from './ProviderManager.js';
import { normalizeProviderId } from './pi-catalog-bridge.js';

/** Minimal structural types — avoid forcing consumers to compile pi sources. */
export type PiAuthStorage = {
  setRuntimeApiKey(provider: string, apiKey: string): void;
};

export type PiModel = {
  id: string;
  provider: string;
  baseUrl?: string;
  [key: string]: unknown;
};

export type PiModelRegistry = {
  refresh(): Promise<void>;
  find(provider: string, modelId: string): PiModel | undefined;
  getAvailable(): PiModel[];
  registerProvider?(
    providerName: string,
    config: { baseUrl?: string; apiKey?: string },
  ): void;
};

export interface CreatePiAuthAndModelInput {
  providerManager: ProviderManager;
  modelId?: string;
  agentDir?: string;
}

export interface CreatePiAuthAndModelResult {
  authStorage: PiAuthStorage;
  modelRegistry: PiModelRegistry;
  model: PiModel;
}

/**
 * Resolve pi auth + model from the active Hive provider.
 *
 * Throws a clear error when there is no active provider / apiKey / resolvable model.
 * Does NOT silently fall back to OAuth or legacy kernel.
 */
export async function createPiAuthAndModel(
  input: CreatePiAuthAndModelInput,
): Promise<CreatePiAuthAndModelResult> {
  const omp = await import('@oh-my-pi/pi-coding-agent');
  const { discoverAuthStorage, ModelRegistry } = omp;

  const active = input.providerManager.active;
  if (!active) {
    throw new Error('No active provider configured for pi kernel');
  }
  if (!active.apiKey) {
    throw new Error(
      `Active provider "${active.id}" has no apiKey; configure a provider apiKey before dispatch`,
    );
  }

  const providerId = normalizeProviderId(active.id);

  const authStorage = await discoverAuthStorage(input.agentDir);
  authStorage.setRuntimeApiKey(providerId, active.apiKey);

  const modelRegistry = new ModelRegistry(authStorage);
  await modelRegistry.refresh();

  // Apply openai-compatible / custom baseUrl without inventing a second provider table.
  if (active.baseUrl && typeof modelRegistry.registerProvider === 'function') {
    modelRegistry.registerProvider(providerId, { baseUrl: active.baseUrl });
  }

  const requestedModelId = input.modelId ?? active.model;
  if (!requestedModelId) {
    throw new Error(
      `Active provider "${providerId}" has no default model and no modelId was provided`,
    );
  }

  let model =
    modelRegistry.find(providerId, requestedModelId) ??
    modelRegistry
      .getAvailable()
      .find(
        (m) =>
          m.id === requestedModelId ||
          m.id.endsWith(`/${requestedModelId}`) ||
          (m.provider === providerId && m.id.includes(requestedModelId)),
      );

  if (!model) {
    throw new Error(
      `Unable to resolve pi model "${requestedModelId}" for provider "${providerId}"`,
    );
  }

  if (active.baseUrl && model.baseUrl !== active.baseUrl) {
    model = { ...model, baseUrl: active.baseUrl };
  }

  return {
    authStorage: authStorage as unknown as PiAuthStorage,
    modelRegistry: modelRegistry as unknown as PiModelRegistry,
    model: model as unknown as PiModel,
  };
}
