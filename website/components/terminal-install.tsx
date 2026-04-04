'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<TabKey>('sdk');

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="overflow-hidden rounded-xl border border-border bg-surface-light">
        {/* Header: dots + tabs */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500/80" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <span className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <div className="flex items-center gap-1">
            {tabs.map((key) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-border text-text-primary'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {t(tabKeyMap[key])}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="relative p-4 font-mono text-sm">
          {/* SDK Tab */}
          {activeTab === 'sdk' && (
            <>
              <div className="mb-2 text-text-muted"># {t('sdkComment')}</div>
              <div className="group relative flex items-center">
                <span className="mr-2 text-amber-500">$</span>
                <code className="text-text-primary">{installCommand}</code>
                <CopyButton code={installCommand} visible />
              </div>
            </>
          )}

          {/* macOS Tab */}
          {activeTab === 'macos' && assets.macos.url && (
            <>
              <div className="mb-2 text-text-muted"># {t('macosComment')}</div>
              <a
                href={assets.macos.url}
                className="inline-flex items-center gap-2 rounded bg-amber-500 px-4 py-2 font-semibold text-black transition-colors hover:bg-amber-600"
              >
                <Download size={16} />
                <span>{assets.macos.name ?? 'Hive.dmg'}</span>
                {tagName && (
                  <span className="text-sm opacity-75">{tagName}</span>
                )}
              </a>
            </>
          )}

          {activeTab === 'macos' && !assets.macos.url && (
            <div className="py-1 text-text-muted">{t('comingSoon')}</div>
          )}

          {/* Windows Tab */}
          {activeTab === 'windows' && (
            <div className="py-1 text-text-muted">{t('comingSoon')}</div>
          )}

          {/* Linux Tab */}
          {activeTab === 'linux' && (
            <div className="py-1 text-text-muted">{t('comingSoon')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
