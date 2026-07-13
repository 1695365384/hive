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

/** Probe installed apps + icons for this file (Tauri only). */
export async function fetchOpenTargets(filename: string): Promise<OpenTarget[]> {
  const ext = fileExtension(filename);
  if (!ext) return [];

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<OpenTarget[]>("get_open_targets", { ext });
  } catch {
    return [];
  }
}
