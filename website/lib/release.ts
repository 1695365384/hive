const GITHUB_REPO = '1695365384/hive';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

const DOWNLOAD_PROXY_BASE = process.env.DOWNLOAD_PROXY_BASE; // e.g. https://hive-download-proxy.xxx.workers.dev
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export interface ReleaseAsset {
  platform: 'macos' | 'windows' | 'linux';
  name: string;
  url: string;
}

export interface ReleaseInfo {
  tagName: string;
  assets: ReleaseAsset[];
}

const EXTENSION_MAP: Record<string, 'macos' | 'windows' | 'linux'> = {
  '.dmg': 'macos',
  '.exe': 'windows',
  '.msi': 'windows',
  '.appimage': 'linux',
  '.deb': 'linux',
};

function mapPlatform(filename: string): 'macos' | 'windows' | 'linux' | null {
  const ext = filename.toLowerCase();
  for (const [suffix, platform] of Object.entries(EXTENSION_MAP)) {
    if (ext.endsWith(suffix)) return platform;
  }
  return null;
}

export async function getLatestRelease(): Promise<ReleaseInfo> {
  const headers: Record<string, string> = {};
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }

  const res = await fetch(GITHUB_API, {
    headers,
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    return { tagName: '', assets: [] };
  }

  const data = await res.json();

  const assets: ReleaseAsset[] = (data.assets ?? [])
    .map((asset: { name: string; browser_download_url: string }) => {
      const platform = mapPlatform(asset.name);
      if (!platform) return null;
      // browser_download_url: https://github.com/.../releases/download/{tag}/{filename}
      const url = DOWNLOAD_PROXY_BASE
        ? `${DOWNLOAD_PROXY_BASE}/download/${data.tag_name}/${asset.name}`
        : asset.browser_download_url;
      return {
        platform,
        name: asset.name,
        url,
      };
    })
    .filter(Boolean);

  return {
    tagName: data.tag_name ?? '',
    assets,
  };
}
