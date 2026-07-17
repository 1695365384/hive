import type { ProviderInfo } from "../../types/provider";

/** Client-side filter for provider picker search. */
export function filterProviders(
  providers: ProviderInfo[],
  query: string,
): ProviderInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return providers;
  return providers.filter(
    (p) =>
      p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
  );
}
