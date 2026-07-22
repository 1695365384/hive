/** Installed app that can open a file type (from native probe). */
export type OpenTarget = {
  label: string;
  openWith: string;
  icon?: string | null;
};

export function fileExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

/** Check if we're running inside Electron (vs browser dev mode). */
function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.hive;
}

/** Probe installed apps + icons for this file (Electron only). */
export async function fetchOpenTargets(filename: string): Promise<OpenTarget[]> {
  const ext = fileExtension(filename);
  if (!ext) return [];

  try {
    if (isElectron()) {
      return await window.hive!.app.getOpenTargets(ext);
    }
    return [];
  } catch {
    return [];
  }
}
