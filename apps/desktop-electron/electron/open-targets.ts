/**
 * Detect installed applications that can open a given file extension.
 *
 * Equivalent to the Tauri open_targets.rs module (~575 lines of Rust).
 * Probes common office suites, returns label + open command + icon.
 */
import { execSync } from "node:child_process";
import { platform } from "node:os";

export interface OpenTargetInfo {
  label: string;
  openWith: string;
  icon?: string | null;
}

interface Candidate {
  label: string;
  probes: string[];
}

const OFFICE_CANDIDATES: Record<string, Candidate[]> = {
  pptx: [
    { label: "Microsoft PowerPoint", probes: ["Microsoft PowerPoint"] },
    { label: "WPS Presentation", probes: ["WPS Office", "wpsoffice"] },
    { label: "Keynote", probes: ["Keynote"] },
    { label: "LibreOffice Impress", probes: ["LibreOffice"] },
  ],
  docx: [
    { label: "Microsoft Word", probes: ["Microsoft Word"] },
    { label: "WPS Writer", probes: ["WPS Office", "wpsoffice"] },
    { label: "Pages", probes: ["Pages"] },
    { label: "LibreOffice Writer", probes: ["LibreOffice"] },
  ],
  xlsx: [
    { label: "Microsoft Excel", probes: ["Microsoft Excel"] },
    { label: "WPS Spreadsheets", probes: ["WPS Office", "wpsoffice"] },
    { label: "Numbers", probes: ["Numbers"] },
    { label: "LibreOffice Calc", probes: ["LibreOffice"] },
  ],
  pdf: [
    { label: "Preview", probes: ["Preview"] },
    { label: "Adobe Acrobat", probes: ["Adobe Acrobat"] },
    { label: "Google Chrome", probes: ["Google Chrome"] },
  ],
};

const DEFAULT_CANDIDATES: Candidate[] = [
  { label: "Default", probes: ["open"] },
];

export function findInstalledApps(ext: string): OpenTargetInfo[] {
  const candidates = OFFICE_CANDIDATES[ext] ?? DEFAULT_CANDIDATES;
  const results: OpenTargetInfo[] = [];

  for (const c of candidates) {
    for (const probe of c.probes) {
      if (canOpen(probe)) {
        results.push({ label: c.label, openWith: c.label, icon: null });
        break;
      }
    }
  }

  return results;
}

function canOpen(appName: string): boolean {
  const sys = platform();

  if (sys === "darwin") {
    try {
      execSync(`osascript -e 'id of application "${appName}"'`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  if (sys === "win32") {
    try {
      execSync(`where "${appName}"`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  if (sys === "linux") {
    try {
      execSync(`which "${appName}"`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
