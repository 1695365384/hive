import i18n from "../i18n";

const SERVER = "http://127.0.0.1:4450";

export type OpenArtifactResult = { ok: true } | { ok: false; error: string };

export type ArtifactFileRef = {
  path?: string;
  src?: string;
  name?: string;
};

/** Decode staged /files/ segment once (avoids double-encoding already-encoded src). */
export function parseStagedFilename(src: string): string {
  const m = src.match(/\/files\/(.+)/);
  return m ? decodeURIComponent(m[1]) : src;
}

/** Build fetch-safe HTTP URL for staged /files/ assets (encodes CJK filenames). */
export function encodeFilesUrl(src: string): string {
  const m = src.match(/\/files\/(.+)/);
  if (!m) return src;
  const name = m[1];
  // Only re-encode if already-decoded (has non-URI-encoded chars)
  if (name !== encodeURIComponent(decodeURIComponent(name))) {
    return `/files/${encodeURIComponent(name)}`;
  }
  return src;
}

/** Prefer staged HTTP src; fall back to absolute path for officecli preview API */
export function resolveArtifactPreviewSrc(path?: string, src?: string): string {
  if (src) return `${SERVER}${src}`;
  if (path) return path;
  return "";
}

/** HTTP URL for fetching file bytes (pptx-preview fallback, etc.) */
export function resolveArtifactHttpUrl(_path?: string, src?: string): string | null {
  if (src) return `${SERVER}${src}`;
  return null;
}

/** Query string for /api/preview/html — prefer absolute disk path to skip URL encoding issues. */
export function buildOfficePreviewQuery(options: {
  src?: string;
  servedPath?: string;
  filePath?: string;
  live?: boolean;
}): string | null {
  const params = new URLSearchParams();
  if (options.filePath) {
    params.set("path", options.filePath);
  } else if (options.servedPath) {
    params.set("path", options.servedPath);
  } else if (options.src) {
    params.set("src", options.src);
  } else {
    return null;
  }
  if (options.live) {
    params.set("live", "1");
  }
  return params.toString();
}

/** Check if we're running inside Electron (vs browser). */
export function isElectronRuntime(): boolean {
  return typeof window !== "undefined" && !!window.hive;
}

/** Best local disk path for open / reveal / save-as. */
export function resolveArtifactLocalPath(ref: ArtifactFileRef): string | null {
  if (ref.path && !ref.path.startsWith("http")) return ref.path;
  if (ref.src) {
    const name = parseStagedFilename(ref.src);
    if (name) {
      // Files are served from .hive/files/ relative to working dir
      return null; // Can't resolve without server context in Electron
    }
  }
  return null;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function fetchArtifactBlob(ref: ArtifactFileRef): Promise<Blob> {
  const url = resolveArtifactHttpUrl(ref.path, ref.src);
  if (!url) throw new Error(i18n.t("file.notFound"));
  const res = await fetch(url);
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
    if (isElectronRuntime()) {
      await window.hive!.file.openPath(filePath, appName);
      return { ok: true };
    }
    return { ok: false, error: "Not in Electron runtime" };
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

  if (!isElectronRuntime()) {
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
    if (isElectronRuntime()) {
      await window.hive!.file.revealInFolder(local);
      return { ok: true };
    }
    return { ok: false, error: "Not in Electron runtime" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/** Save a copy to user-chosen location (Codex-style export). */
export async function saveArtifactAs(ref: ArtifactFileRef): Promise<OpenArtifactResult> {
  if (!isElectronRuntime()) {
    return downloadArtifactAsBrowser(ref);
  }

  try {
    const target = await window.hive!.file.showSaveDialog({
      defaultPath: ref.name,
      title: i18n.t("file.saveAsTitle"),
    });
    if (!target) {
      return { ok: false, error: i18n.t("file.cancelled") };
    }

    const local = resolveArtifactLocalPath(ref);

    if (local) {
      await window.hive!.file.copy(local, target);
    } else {
      const blob = await fetchArtifactBlob(ref);
      const data = await blob.arrayBuffer();
      await window.hive!.file.write(data, ref.name ?? "file");
      // Then copy from temp to target
      await window.hive!.file.copy(
        await window.hive!.file.write(data, ref.name ?? "file"),
        target,
      );
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
    downloadBlob(blob, ref.name ?? "download");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/** @deprecated Use openArtifactDefault or ArtifactFileMenu */
export async function openArtifactFile(ref: ArtifactFileRef): Promise<OpenArtifactResult> {
  return openArtifactDefault(ref);
}
