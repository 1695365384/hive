'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Package } from 'lucide-react';
import { CopyButton } from './copy-button';

interface PlatformAsset {
  url?: string;
  name?: string;
}

interface TerminalInstallProps {
  assets: Record<'macos' | 'windows' | 'linux', PlatformAsset>;
  tagName: string;
  installCommand: string;
}

type TabKey = 'sdk' | 'macos' | 'windows' | 'linux';

const tabs: TabKey[] = ['sdk', 'macos', 'windows', 'linux'];

const tabKeyMap: Record<TabKey, string> = {
  sdk: 'tabSdk',
  macos: 'tabMacos',
  windows: 'tabWindows',
  linux: 'tabLinux',
};

export function TerminalInstall({ assets, tagName, installCommand }: TerminalInstallProps) {
  const t = useTranslations('hero');
  const [activeTab, setActiveTab] = useState<TabKey>('macos');

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Segmented control */}
      <div className="mx-auto mb-4 inline-flex rounded-full border border-border/60 bg-surface-light p-1">
        {tabs.map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`relative rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
              activeTab === key
                ? 'bg-amber-500 text-black shadow-sm shadow-amber-500/25'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {t(tabKeyMap[key])}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="relative rounded-2xl border border-border/40 bg-surface-light/80 p-5 backdrop-blur-sm">
        {/* SDK Tab */}
        {activeTab === 'sdk' && (
          <div className="flex items-center gap-3 rounded-xl bg-black/30 px-4 py-3 font-mono text-sm">
            <span className="text-amber-500">$</span>
            <code className="flex-1 text-text-primary">{installCommand}</code>
            <CopyButton code={installCommand} visible />
          </div>
        )}

        {/* macOS Tab */}
        {activeTab === 'macos' && assets.macos.url && (
          <a
            href={assets.macos.url}
            className="group flex items-center gap-3 rounded-xl bg-amber-500 px-5 py-3.5 font-semibold text-black transition-all hover:bg-amber-400 hover:shadow-lg hover:shadow-amber-500/20"
          >
            <Download size={18} className="shrink-0" />
            <div className="flex flex-1 items-baseline gap-2">
              <span>{assets.macos.name ?? 'Hive.dmg'}</span>
              {tagName && (
                <span className="text-sm font-normal opacity-60">{tagName}</span>
              )}
            </div>
            <Package size={14} className="opacity-50" />
          </a>
        )}

        {activeTab === 'macos' && !assets.macos.url && (
          <div className="py-2 text-center text-sm text-text-muted">{t('comingSoon')}</div>
        )}

        {/* Windows Tab */}
        {activeTab === 'windows' && (
          <div className="py-2 text-center text-sm text-text-muted">{t('comingSoon')}</div>
        )}

        {/* Linux Tab */}
        {activeTab === 'linux' && (
          <div className="py-2 text-center text-sm text-text-muted">{t('comingSoon')}</div>
        )}
      </div>
    </div>
  );
}
