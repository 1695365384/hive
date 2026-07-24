/**
 * Detect installed applications that can open a given file extension.
 *
 * Prefer filesystem probes over osascript — the latter blocks the UI for
 * hundreds of ms per candidate and makes "Open with…" feel 磕磕巴巴.
 */
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";

export interface OpenTargetInfo {
  label: string;
  openWith: string;
  icon?: string | null;
}

interface Candidate {
  label: string;
  /** macOS .app bundle names / Windows exe names / Linux binaries */
  probes: string[];
}

const OFFICE_CANDIDATES: Record<string, Candidate[]> = {
  pptx: [
    { label: "Microsoft PowerPoint", probes: ["Microsoft PowerPoint"] },
    { label: "WPS Presentation", probes: ["WPS Office", "wpsoffice", "WPS Office.app"] },
    { label: "Keynote", probes: ["Keynote"] },
    { label: "LibreOffice Impress", probes: ["LibreOffice", "LibreOffice.app"] },
  ],
  docx: [
    { label: "Microsoft Word", probes: ["Microsoft Word"] },
    { label: "WPS Writer", probes: ["WPS Office", "wpsoffice", "WPS Office.app"] },
    { label: "Pages", probes: ["Pages"] },
    { label: "LibreOffice Writer", probes: ["LibreOffice", "LibreOffice.app"] },
  ],
  xlsx: [
    { label: "Microsoft Excel", probes: ["Microsoft Excel"] },
    { label: "WPS Spreadsheets", probes: ["WPS Office", "wpsoffice", "WPS Office.app"] },
    { label: "Numbers", probes: ["Numbers"] },
    { label: "LibreOffice Calc", probes: ["LibreOffice", "LibreOffice.app"] },
  ],
  pdf: [
    { label: "Preview", probes: ["Preview"] },
    { label: "Adobe Acrobat", probes: ["Adobe Acrobat", "Adobe Acrobat DC"] },
    { label: "Google Chrome", probes: ["Google Chrome"] },
  ],
};

const DEFAULT_CANDIDATES: Candidate[] = [];

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { ts: number; apps: OpenTargetInfo[] }>();

export function findInstalledApps(ext: string): OpenTargetInfo[] {
  const key = ext.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return hit.apps;
  }

  const candidates = OFFICE_CANDIDATES[key] ?? DEFAULT_CANDIDATES;
  const results: OpenTargetInfo[] = [];

  for (const c of candidates) {
    for (const probe of c.probes) {
      if (canOpen(probe)) {
        results.push({ label: c.label, openWith: c.label, icon: null });
        break;
      }
    }
  }

  cache.set(key, { ts: Date.now(), apps: results });
  return results;
}

/** Test helper — clear probe cache. */
export function clearOpenTargetsCache(): void {
  cache.clear();
}

function canOpen(appName: string): boolean {
  const sys = platform();
  const bare = appName.replace(/\.app$/i, "");

  if (sys === "darwin") {
    const homes = [
      "/Applications",
      "/System/Applications",
      path.join(homedir(), "Applications"),
    ];
    for (const root of homes) {
      if (existsSync(path.join(root, `${bare}.app`))) return true;
      if (existsSync(path.join(root, appName))) return true;
    }
    return false;
  }

  if (sys === "win32") {
    // Cheap PATH probe only — avoid spawning where.exe for every menu open.
    const pathEnv = process.env.PATH ?? "";
    return pathEnv.toLowerCase().includes(bare.toLowerCase());
  }

  if (sys === "linux") {
    const pathEnv = process.env.PATH ?? "";
    for (const dir of pathEnv.split(":")) {
      if (dir && existsSync(path.join(dir, bare))) return true;
    }
    return false;
  }

  return false;
}
