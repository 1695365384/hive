'use client';

import { useTranslations } from 'next-intl';
import { Apple, Monitor, Download } from 'lucide-react';

const GITHUB_REPO = '1695365384/hive';
const DOWNLOAD_BASE = `https://github.com/${GITHUB_REPO}/releases/latest/download`;

const platforms = [
  {
    key: 'macos',
    icon: Apple,
    filename: 'Hive.dmg',
    available: true,
  },
  {
    key: 'windows',
    icon: Monitor,
    filename: 'Hive.exe',
    available: false,
  },
  {
    key: 'linux',
    icon: Download,
    filename: 'Hive.AppImage',
    available: false,
  },
] as const;

export function DownloadButtons() {
  const t = useTranslations('download');

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {platforms.map(({ key, icon: Icon, filename, available }) =>
        available ? (
          <a
            key={key}
            href={`${DOWNLOAD_BASE}/${filename}`}
            className="inline-flex items-center gap-2 rounded bg-amber-500 px-5 py-3 font-semibold text-black transition-colors hover:bg-amber-600"
          >
            <Icon size={18} />
            <span>{t(key)}</span>
            <span className="text-sm opacity-75">{t(`${key}Format`)}</span>
          </a>
        ) : (
          <span
            key={key}
            className="inline-flex items-center gap-2 rounded border border-border px-5 py-3 font-semibold text-text-muted opacity-50"
          >
            <Icon size={18} />
            <span>{t(key)}</span>
            <span className="text-sm">{t('comingSoon')}</span>
          </span>
        ),
      )}
    </div>
  );
}
