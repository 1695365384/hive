'use client';

import { useTranslations } from 'next-intl';
import { Apple, Monitor, Download } from 'lucide-react';

interface PlatformAsset {
  url?: string;
  name?: string;
}

interface DownloadButtonsProps {
  assets: Record<'macos' | 'windows' | 'linux', PlatformAsset>;
  tagName: string;
}

const platformConfig = [
  {
    key: 'macos' as const,
    icon: Apple,
    formatKey: 'macosFormat',
  },
  {
    key: 'windows' as const,
    icon: Monitor,
    formatKey: 'windowsFormat',
  },
  {
    key: 'linux' as const,
    icon: Download,
    formatKey: 'linuxFormat',
  },
];

export function DownloadButtons({ assets, tagName }: DownloadButtonsProps) {
  const t = useTranslations('download');

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {platformConfig.map(({ key, icon: Icon, formatKey }) => {
        const asset = assets[key];
        const available = !!asset?.url;

        return available ? (
          <a
            key={key}
            href={asset.url}
            className="inline-flex items-center gap-2 rounded bg-amber-500 px-5 py-3 font-semibold text-black transition-colors hover:bg-amber-600"
          >
            <Icon size={18} />
            <span>{t(key)}</span>
            {tagName && (
              <span className="text-sm opacity-75">{tagName}</span>
            )}
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
        );
      })}
    </div>
  );
}
