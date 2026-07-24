/**
 * Hive provider catalog bridge — single source of truth = oh-my-pi catalog.
 *
 * UI list / model picker / ProviderManager baseUrl+defaultModel / testKey
 * all resolve through this module. models.dev is no longer on the live path.
 *
 * - Bundled model DB: `@oh-my-pi/pi-catalog/models.json` (JSON, Node+Bun)
 * - Provider meta (defaultModel/env/label): `pi-catalog-descriptors.json`
 *   regenerated from CATALOG_PROVIDERS when bumping `@oh-my-pi/pi-catalog`
 * - Runtime LLM probe: dynamic `@oh-my-pi/pi-ai` + `@oh-my-pi/pi-coding-agent`
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ModelSpec, PiCatalogProvider, ProviderType } from './types.js';

/** Legacy Hive / models.dev ids → canonical pi catalog ids. */
export const PROVIDER_ID_ALIASES: Record<string, string> = {
  glm: 'zai',
  zhipu: 'zai',
  'zhipu-ai': 'zai',
  kimi: 'moonshot',
  moonshotai: 'moonshot',
  qwen: 'qwen-portal',
  dashscope: 'qwen-portal',
  alibaba: 'alibaba-coding-plan',
};

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  deepseek: 'DeepSeek',
  zai: '智谱 / zAI',
  moonshot: 'Kimi / Moonshot',
  'qwen-portal': '通义千问',
  'alibaba-coding-plan': '阿里云 Coding Plan',
  'kimi-code': 'Kimi Code',
  'zhipu-coding-plan': '智谱 Coding Plan',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  groq: 'Groq',
  minimax: 'MiniMax',
  'minimax-cn': 'MiniMax CN',
};

/** Prefer these near the top of SetupWizard / ConfigPage. */
const PROVIDER_SORT_PRIORITY = [
  'deepseek',
  'zai',
  'moonshot',
  'qwen-portal',
  'alibaba-coding-plan',
  'anthropic',
  'openai',
  'google',
  'openrouter',
  'kimi-code',
  'zhipu-coding-plan',
  'groq',
  'minimax',
  'minimax-cn',
  'xai',
  'mistral',
];

export interface PiProviderDescriptor {
  id: string;
  defaultModel: string;
  envVars: string[];
  label: string | null;
  allowUnauthenticated?: boolean;
  specialModelManager?: boolean;
}

export interface ProviderConnectionTestResult {
  valid: boolean;
  error?: string;
  errorKind?: 'auth' | 'network' | 'model' | 'unknown';
  latencyMs?: number;
  modelUsed?: string;
}

interface RawBundledModel {
  id: string;
  name?: string;
  provider?: string;
  baseUrl?: string;
  api?: string;
  reasoning?: boolean;
  input?: Array<'text' | 'image'>;
  supportsTools?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

type BundledModelsDb = Record<string, Record<string, RawBundledModel>>;

let modelsDb: BundledModelsDb | null = null;
let providerCache: PiCatalogProvider[] | null = null;

export function normalizeProviderId(id: string | null | undefined): string {
  if (id == null) return '';
  const lower = String(id).trim().toLowerCase();
  if (!lower) return '';
  return PROVIDER_ID_ALIASES[lower] ?? lower;
}

export function getPiCatalogDescriptors(): readonly PiProviderDescriptor[] {
  return descriptors as PiProviderDescriptor[];
}

export function getPiCatalogDescriptor(id: string): PiProviderDescriptor | undefined {
  const canonical = normalizeProviderId(id);
  return getPiCatalogDescriptors().find((d) => d.id === canonical);
}

function loadDescriptors(): readonly PiProviderDescriptor[] {
  const url = new URL('./pi-catalog-descriptors.json', import.meta.url);
  const raw = JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as PiProviderDescriptor[];
  return raw;
}

const descriptors = loadDescriptors();

function resolveModelsJsonPath(): string {
  // Node 20+/Bun: import.meta.resolve is sync for this package export.
  const resolved = import.meta.resolve('@oh-my-pi/pi-catalog/models.json');
  return fileURLToPath(resolved);
}

function loadBundledModelsDbSync(): BundledModelsDb {
  if (modelsDb) return modelsDb;
  const parsed = JSON.parse(readFileSync(resolveModelsJsonPath(), 'utf8')) as BundledModelsDb;
  modelsDb = parsed;
  return parsed;
}

async function loadBundledModelsDb(): Promise<BundledModelsDb> {
  return loadBundledModelsDbSync();
}

function inferProviderType(providerId: string, sample?: RawBundledModel): ProviderType {
  if (providerId === 'anthropic' || sample?.api === 'anthropic-messages') {
    return 'anthropic';
  }
  if (providerId === 'google' || providerId.startsWith('google-')) {
    return 'google';
  }
  return 'openai-compatible';
}

function displayName(id: string, label: string | null | undefined): string {
  if (DISPLAY_NAME_OVERRIDES[id]) return DISPLAY_NAME_OVERRIDES[id];
  if (label && label.trim()) return label;
  return id;
}

function toModelSpec(raw: RawBundledModel): ModelSpec {
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    contextWindow: raw.contextWindow ?? 128_000,
    maxOutputTokens: raw.maxTokens,
    supportsTools: raw.supportsTools ?? true,
    supportsReasoning: raw.reasoning === true,
    supportsVision: Array.isArray(raw.input) ? raw.input.includes('image') : false,
    supportsStreaming: true,
    supportsSystemMessages: true,
    pricing: raw.cost
      ? {
          input: raw.cost.input,
          output: raw.cost.output,
          cacheRead: raw.cost.cacheRead,
          cacheWrite: raw.cost.cacheWrite,
          currency: 'USD',
        }
      : undefined,
  };
}

function buildProvider(
  descriptor: PiProviderDescriptor,
  db: BundledModelsDb,
): PiCatalogProvider {
  const rawModels = Object.values(db[descriptor.id] ?? {});
  const models = rawModels.map(toModelSpec);

  if (
    descriptor.defaultModel &&
    !models.some((m) => m.id === descriptor.defaultModel)
  ) {
    models.unshift({
      id: descriptor.defaultModel,
      name: descriptor.defaultModel,
      contextWindow: 128_000,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
    });
  } else if (descriptor.defaultModel) {
    const idx = models.findIndex((m) => m.id === descriptor.defaultModel);
    if (idx > 0) {
      const [preferred] = models.splice(idx, 1);
      models.unshift(preferred);
    }
  }

  const sample = rawModels[0];
  return {
    id: descriptor.id,
    name: displayName(descriptor.id, descriptor.label),
    baseUrl: sample?.baseUrl ?? '',
    envKeys: [...(descriptor.envVars ?? [])],
    type: inferProviderType(descriptor.id, sample),
    models,
  };
}

function sortProviders(providers: PiCatalogProvider[]): PiCatalogProvider[] {
  return [...providers].sort((a, b) => {
    const ia = PROVIDER_SORT_PRIORITY.indexOf(a.id);
    const ib = PROVIDER_SORT_PRIORITY.indexOf(b.id);
    if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/** Warm / rebuild the in-memory provider+model cache from pi catalog data. */
export async function warmPiCatalog(force = false): Promise<void> {
  if (providerCache && !force) return;
  const db = await loadBundledModelsDb();
  providerCache = sortProviders(
    getPiCatalogDescriptors().map((d) => buildProvider(d, db)),
  );
}

export async function listPiProviders(): Promise<PiCatalogProvider[]> {
  await warmPiCatalog();
  return providerCache ?? [];
}

export async function listPiProviderModels(providerId: string): Promise<ModelSpec[]> {
  await warmPiCatalog();
  const canonical = normalizeProviderId(providerId);
  const provider = providerCache?.find((p) => p.id === canonical);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId} (canonical: ${canonical})`);
  }
  return provider.models;
}

export function getPiProviderMetaSync(providerId: string): PiCatalogProvider | null {
  const canonical = normalizeProviderId(providerId);
  return providerCache?.find((p) => p.id === canonical) ?? null;
}

/** Sync descriptor-only meta (works before warm; no baseUrl/models). */
export function getPiProviderDescriptorSync(providerId: string): {
  id: string;
  name: string;
  defaultModel: string;
  envKeys: string[];
  type: ProviderType;
  baseUrl?: string;
} | null {
  const descriptor = getPiCatalogDescriptor(providerId);
  if (!descriptor) return null;
  const warmed = getPiProviderMetaSync(descriptor.id);
  const db = loadBundledModelsDbSync();
  const sample = Object.values(db[descriptor.id] ?? {})[0];
  return {
    id: descriptor.id,
    name: displayName(descriptor.id, descriptor.label),
    defaultModel: descriptor.defaultModel,
    envKeys: [...(descriptor.envVars ?? [])],
    type: warmed?.type ?? inferProviderType(descriptor.id, sample),
    baseUrl: warmed?.baseUrl ?? sample?.baseUrl,
  };
}

function classifyError(msg: string): ProviderConnectionTestResult['errorKind'] {
  const lower = msg.toLowerCase();
  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('incorrect api key') ||
    lower.includes('authentication') ||
    lower.includes('permission denied') ||
    lower.includes('403')
  ) {
    return 'auth';
  }
  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('enotfound') ||
    lower.includes('abort')
  ) {
    return 'network';
  }
  if (
    lower.includes('model') &&
    (lower.includes('not found') || lower.includes('does not exist') || lower.includes('unavailable'))
  ) {
    return 'model';
  }
  return 'unknown';
}

/** Probe an API key via pi-ai (same stack as the chat kernel). */
export async function testPiProviderConnection(
  providerId: string,
  apiKey: string,
  model?: string,
): Promise<ProviderConnectionTestResult> {
  const startTime = Date.now();

  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, error: 'API key is empty', errorKind: 'auth' };
  }

  await warmPiCatalog();
  const canonical = normalizeProviderId(providerId);
  const meta = getPiProviderMetaSync(canonical);
  if (!meta) {
    return {
      valid: false,
      error: `Unknown provider: ${providerId}`,
      errorKind: 'unknown',
    };
  }

  const modelUsed =
    model || meta.models[0]?.id || getPiCatalogDescriptor(canonical)?.defaultModel;
  if (!modelUsed) {
    return {
      valid: false,
      error: `Provider "${canonical}" has no model to test`,
      errorKind: 'model',
    };
  }

  try {
    const omp = await import('@oh-my-pi/pi-coding-agent');
    const ai = await import('@oh-my-pi/pi-ai');

    const authStorage = await omp.discoverAuthStorage();
    authStorage.setRuntimeApiKey(canonical, apiKey);

    const modelRegistry = new omp.ModelRegistry(authStorage);
    await modelRegistry.refresh();

    if (meta.baseUrl && typeof modelRegistry.registerProvider === 'function') {
      modelRegistry.registerProvider(canonical, { baseUrl: meta.baseUrl, apiKey });
    }

    let piModel =
      modelRegistry.find(canonical, modelUsed) ??
      modelRegistry
        .getAvailable()
        .find(
          (m: { id: string; provider: string }) =>
            m.provider === canonical &&
            (m.id === modelUsed || m.id.endsWith(`/${modelUsed}`)),
        ) ??
      modelRegistry.getAll().find(
        (m: { id: string; provider: string }) =>
          m.provider === canonical &&
          (m.id === modelUsed || m.id.endsWith(`/${modelUsed}`)),
      );

    if (!piModel) {
      return {
        valid: false,
        error: `Unable to resolve pi model "${modelUsed}" for provider "${canonical}"`,
        errorKind: 'model',
        latencyMs: Date.now() - startTime,
        modelUsed,
      };
    }

    if (meta.baseUrl && piModel.baseUrl !== meta.baseUrl) {
      piModel = { ...piModel, baseUrl: meta.baseUrl };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      await ai.completeSimple(
        piModel,
        { messages: [{ role: 'user', content: 'ping', timestamp: Date.now() }] },
        { maxTokens: 1, signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }

    return {
      valid: true,
      latencyMs: Date.now() - startTime,
      modelUsed,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      error: errorMsg,
      errorKind: classifyError(errorMsg),
      latencyMs: Date.now() - startTime,
      modelUsed,
    };
  }
}

/** Test-only: inject a prebuilt provider cache. */
export function __setPiCatalogCacheForTests(providers: PiCatalogProvider[] | null): void {
  providerCache = providers;
  if (!providers) {
    modelsDb = null;
  }
}
