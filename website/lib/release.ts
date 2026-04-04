const GITHUB_REPO = '1695365384/hive';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

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
  const res = await fetch(GITHUB_API, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return { tagName: '', assets: [] };
  }

  const data = await res.json();

  const assets: ReleaseAsset[] = (data.assets ?? [])
    .map((asset: { name: string; browser_download_url: string }) => {
      const platform = mapPlatform(asset.name);
      if (!platform) return null;
      return {
        platform,
        name: asset.name,
        url: asset.browser_download_url,
      };
    })
    .filter(Boolean);

  return {
    tagName: data.tag_name ?? '',
    assets,
  };
}
