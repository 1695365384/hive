'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { DownloadButtons } from './download-buttons';

export function Hero() {
  const t = useTranslations('hero');
  const [copied, setCopied] = useState(false);
  const command = t('installCommand');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="px-6 pb-20 pt-32">
      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/5 px-3 py-1 text-sm text-amber-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
          {t('badge')}
        </div>

        <h1 className="mb-6 text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl">
          {t('title')}{' '}
          <span className="text-amber-500">{t('titleHighlight')}</span>
        </h1>

        <p className="mx-auto mb-10 max-w-2xl text-lg text-text-secondary md:text-xl">
          {t('subtitle')}
        </p>

        <div className="mb-8">
          <DownloadButtons />
          <div className="mt-4 flex items-center justify-center">
            <a
              href="https://github.com/1695365384/hive#quick-start"
              className="rounded border border-border px-6 py-3 text-text-primary transition-colors hover:border-border-light"
            >
              {t('secondary')}
            </a>
          </div>
        </div>

        <div className="inline-flex items-center gap-3 rounded border border-border bg-surface-light px-5 py-3 font-mono text-sm opacity-60">
          <span className="text-text-muted">$</span>
          <code>{command}</code>
          <button
            onClick={handleCopy}
            className="ml-2 cursor-pointer rounded border border-border px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:border-border-light hover:text-text-secondary"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    </section>
  );
}
