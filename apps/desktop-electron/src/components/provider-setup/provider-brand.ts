/**
 * Brand tiles for provider logos.
 * models.dev SVGs are mostly currentColor (render black as <img>),
 * so we place them on a light tinted tile keyed by vendor.
 */

export interface ProviderBrand {
  /** Soft tile background (light). */
  tint: string;
  /** Accent for ring / initials. */
  accent: string;
}

const BRANDS: { match: RegExp; brand: ProviderBrand }[] = [
  { match: /^(openai|chatgpt)/, brand: { tint: "#E7F8F3", accent: "#10A37F" } },
  { match: /^anthropic|claude/, brand: { tint: "#FAF6F1", accent: "#D97757" } },
  {
    match: /google|gemini|vertex/,
    brand: { tint: "#EEF4FF", accent: "#4285F4" },
  },
  { match: /deepseek/, brand: { tint: "#EEF2FF", accent: "#4D6BFE" } },
  {
    match: /alibaba|dashscope|qwen|tongyi/,
    brand: { tint: "#FFF4EB", accent: "#FF6A00" },
  },
  {
    match: /moonshot|kimi/,
    brand: { tint: "#F3E8FF", accent: "#7C3AED" },
  },
  { match: /zhipu|glm/, brand: { tint: "#EAF2FF", accent: "#3485FF" } },
  { match: /openrouter/, brand: { tint: "#EEF0FF", accent: "#6566F1" } },
  {
    match: /azure|microsoft/,
    brand: { tint: "#E8F3FF", accent: "#0078D4" },
  },
  {
    match: /amazon|bedrock|aws/,
    brand: { tint: "#FFF6E5", accent: "#FF9900" },
  },
  { match: /mistral/, brand: { tint: "#FFF5EB", accent: "#F97316" } },
  { match: /groq/, brand: { tint: "#FFEFEB", accent: "#F55036" } },
  { match: /cohere/, brand: { tint: "#E8F0EC", accent: "#39594D" } },
  { match: /together/, brand: { tint: "#EAF2FF", accent: "#0F6FFF" } },
  { match: /fireworks/, brand: { tint: "#F3E8FF", accent: "#7C3AED" } },
  {
    match: /perplexity/,
    brand: { tint: "#E6F5F5", accent: "#20808D" },
  },
  { match: /^(xai|grok)/, brand: { tint: "#F4F4F5", accent: "#18181B" } },
  {
    match: /302\.?ai|aihubmix|ai-router/,
    brand: { tint: "#EEF2FF", accent: "#4F46E5" },
  },
  {
    match: /siliconflow|silicon/,
    brand: { tint: "#EEF0FF", accent: "#5B5FC7" },
  },
  {
    match: /huggingface|hf-inference/,
    brand: { tint: "#FFF7ED", accent: "#FF9D00" },
  },
  { match: /ollama/, brand: { tint: "#F4F4F5", accent: "#1C1917" } },
  { match: /nvidia|nim/, brand: { tint: "#E8F8EF", accent: "#76B900" } },
  {
    match: /meta|llama|together-meta/,
    brand: { tint: "#EEF2FF", accent: "#0668E1" },
  },
  { match: /vercel|v0/, brand: { tint: "#F4F4F5", accent: "#000000" } },
  {
    match: /cloudflare/,
    brand: { tint: "#FFF4ED", accent: "#F6821F" },
  },
  { match: /minimax/, brand: { tint: "#EEF2FF", accent: "#6366F1" } },
  { match: /baichuan/, brand: { tint: "#FFF1F0", accent: "#E85D4C" } },
  {
    match: /^(yi|01-ai|01ai)/,
    brand: { tint: "#EEF2FF", accent: "#3B82F6" },
  },
  { match: /stepfun|step-/, brand: { tint: "#F0FDF4", accent: "#16A34A" } },
  {
    match: /doubao|bytedance|volcengine|ark/,
    brand: { tint: "#EFF6FF", accent: "#3B82F6" },
  },
  {
    match: /tencent|hunyuan/,
    brand: { tint: "#EFF6FF", accent: "#0052D9" },
  },
  {
    match: /baidu|ernie|qianfan/,
    brand: { tint: "#EEF2FF", accent: "#2932E1" },
  },
  {
    match: /opencode|zen/,
    brand: { tint: "#ECFDF5", accent: "#059669" },
  },
  { match: /abacus/, brand: { tint: "#F0F9FF", accent: "#0284C7" } },
  {
    match: /cerebras/,
    brand: { tint: "#FFF7ED", accent: "#F59E0B" },
  },
  {
    match: /github.?copilot|copilot/,
    brand: { tint: "#F4F4F5", accent: "#24292F" },
  },
];

const FALLBACK_PALETTE: ProviderBrand[] = [
  { tint: "#EEF2FF", accent: "#6366F1" },
  { tint: "#FDF2F8", accent: "#DB2777" },
  { tint: "#ECFDF5", accent: "#059669" },
  { tint: "#FFF7ED", accent: "#EA580C" },
  { tint: "#F5F3FF", accent: "#7C3AED" },
  { tint: "#ECFEFF", accent: "#0891B2" },
  { tint: "#FEF3C7", accent: "#D97706" },
  { tint: "#F1F5F9", accent: "#475569" },
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getProviderBrand(providerId: string): ProviderBrand {
  const id = providerId.toLowerCase();
  for (const entry of BRANDS) {
    if (entry.match.test(id)) return entry.brand;
  }
  return FALLBACK_PALETTE[hashId(id) % FALLBACK_PALETTE.length];
}
