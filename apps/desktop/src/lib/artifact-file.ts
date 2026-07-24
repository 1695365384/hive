import i18n from "../i18n";

const SERVER = "http://127.0.0.1:4450";

export type OpenArtifactResult = { ok: true } | { ok: false; error: string };

export type ArtifactFileRef = {
  path?: string;
  servedPath?: string;
  src?: string;
  name: string;
};

/** Decode staged /files/ segment once (avoids double-encoding already-encoded src). */
export function parseStagedFilename(src: string): string {
  const raw = src.startsWith("/files/") ? src.slice("/files/".length) : src;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Build fetch-safe HTTP URL for staged /files/ assets (encodes CJK filenames). */
export function encodeFilesUrl(src: string): string {
  if (src.startsWith("/files/")) {
    const filename = parseStagedFilename(src);
    return `${SERVER}/files/${encodeURIComponent(filename)}`;
  }
  if (src.startsWith("http")) return src;
  return `${SERVER}${src.startsWith("/") ? src : `/${src}`}`;
}

/** Prefer staged HTTP src; fall back to absolute path for officecli preview API */
export function resolveArtifactPreviewSrc(path?: string, src?: string): string {
  if (src?.startsWith("/files/")) return encodeFilesUrl(src);
  if (path) return path;
  if (src) return src.startsWith("http") ? src : encodeFilesUrl(src);
  return "";
}

/** HTTP URL for fetching file bytes (pptx-preview fallback, etc.) */
export function resolveArtifactHttpUrl(_path?: string, src?: string): string | null {
  if (src?.startsWith("/files/")) return encodeFilesUrl(src);
  if (src?.startsWith("http")) return src;
  if (src) return encodeFilesUrl(src);
  return null;
}

/** Query string for /api/preview/html — prefer absolute disk path to skip URL encoding issues. */
export function buildOfficePreviewQuery(options: {
  src?: string;
  servedPath?: string;
  filePath?: string;
  live?: boolean;
}): string | null {
  const { src, servedPath, filePath, live } = options;
  const diskPath = servedPath || filePath;
  if (diskPath && !diskPath.startsWith("http")) {
    return `path=${encodeURIComponent(diskPath)}${live ? "&live=1" : ""}`;
  }
  if (src?.startsWith("/files/")) {
    const fileName = parseStagedFilename(src);
    if (!fileName) return null;
    return `file=${encodeURIComponent(fileName)}${live ? "&live=1" : ""}`;
  }
  if (src && !src.startsWith("http")) {
    return `path=${encodeURIComponent(src)}${live ? "&live=1" : ""}`;
  }
  return null;
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Best local disk path for open / reveal / save-as. */
export function resolveArtifactLocalPath(ref: ArtifactFileRef): string | null {
  for (const candidate of [ref.servedPath, ref.path]) {
    if (candidate && !candidate.startsWith("http")) return candidate;
  }
  return null;
}

/** Load exact artifact bytes (HTTP staged URL preferred). */
export async function loadArtifactArrayBuffer(ref: ArtifactFileRef): Promise<ArrayBuffer> {
  const http = resolveArtifactHttpUrl(ref.path, ref.src);
  if (http) {
    const res = await fetch(http);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  }
  throw new Error(i18n.t("file.notFound"));
}

/** Load exact HTML/text for the clicked file. */
export async function loadArtifactText(ref: ArtifactFileRef): Promise<string> {
  const http = resolveArtifactHttpUrl(ref.path, ref.src);
  if (http) {
    const res = await fetch(http);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  throw new Error(i18n.t("file.notFound"));
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function fetchArtifactBlob(ref: ArtifactFileRef): Promise<Blob> {
  const httpUrl = resolveArtifactHttpUrl(undefined, ref.src);
  if (!httpUrl) throw new Error(i18n.t("file.noSource"));
  const res = await fetch(httpUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

async function openPathWith(
  filePath: string,
  appName?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!filePath || filePath.startsWith("http")) {
    return { ok: false, error: i18n.t("file.invalidPath") };
  }
  try {
    if (isTauriRuntime()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_local_file", { path: filePath, with: appName ?? null });
      return { ok: true };
    }
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(filePath, appName);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/** Open with system default app for this file type. */
export async function openArtifactDefault(ref: ArtifactFileRef): Promise<OpenArtifactResult> {
  const local = resolveArtifactLocalPath(ref);
  if (local) {
    const result = await openPathWith(local);
    if (result.ok) return result;
  }

  if (!isTauriRuntime()) {
    return downloadArtifactAsBrowser(ref);
  }
  return { ok: false, error: i18n.t("file.notFoundUseSaveAs") };
}

/** Open with a specific app (e.g. WPS Office, Microsoft Word). */
export async function openArtifactWithApp(
  ref: ArtifactFileRef,
  appName: string,
): Promise<OpenArtifactResult> {
  const local = resolveArtifactLocalPath(ref);
  if (!local) {
    return { ok: false, error: i18n.t("file.notFound") };
  }
  return openPathWith(local, appName);
}

/** Reveal file in Finder / Explorer. */
export async function revealArtifactInFolder(ref: ArtifactFileRef): Promise<OpenArtifactResult> {
  const local = resolveArtifactLocalPath(ref);
  if (!local) {
    return { ok: false, error: i18n.t("file.notFound") };
  }
  try {
    if (isTauriRuntime()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reveal_local_file", { path: local });
      return { ok: true };
    }
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(local);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/** Save a copy to user-chosen location (Codex-style export). */
export async function saveArtifactAs(ref: ArtifactFileRef): Promise<OpenArtifactResult> {
  if (!isTauriRuntime()) {
    return downloadArtifactAsBrowser(ref);
  }

  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const target = await save({
      defaultPath: ref.name,
      title: i18n.t("file.saveAsTitle"),
    });
    if (!target) {
      return { ok: false, error: i18n.t("file.cancelled") };
    }

    const local = resolveArtifactLocalPath(ref);
    const { invoke } = await import("@tauri-apps/api/core");

    if (local) {
      await invoke("copy_artifact_file", { from: local, to: target });
    } else {
      const blob = await fetchArtifactBlob(ref);
      const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await invoke("write_artifact_bytes", { path: target, data });
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: i18n.t("file.saveAsFailed", { detail: msg }) };
  }
}

async function downloadArtifactAsBrowser(ref: ArtifactFileRef): Promise<OpenArtifactResult> {
  try {
    const blob = await fetchArtifactBlob(ref);
    downloadBlob(blob, ref.name);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: i18n.t("file.downloadFailed", { detail: msg }) };
  }
}

/** @deprecated Use openArtifactDefault or ArtifactFileMenu */
export async function openArtifactFile(ref: ArtifactFileRef): Promise<OpenArtifactResult> {
  return openArtifactDefault(ref);
}
