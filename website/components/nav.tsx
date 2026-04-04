'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Nav() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 h-16">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.svg" alt="Hive" className="h-8 w-8" />
          <span className="text-lg font-semibold">Hive</span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <a
            href="https://github.com/1695365384/hive"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            {t('github')}
          </a>
          <div className="flex items-center gap-1 text-sm">
            <Link
              href="/"
              locale="en"
              className={`rounded px-2 py-1 ${locale === 'en' ? 'text-amber-500' : 'text-text-muted hover:text-text-secondary'}`}
            >
              EN
            </Link>
            <span className="text-text-muted">|</span>
            <Link
              href="/"
              locale="zh"
              className={`rounded px-2 py-1 ${locale === 'zh' ? 'text-amber-500' : 'text-text-muted hover:text-text-secondary'}`}
            >
              中文
            </Link>
          </div>
          <a
            href="https://github.com/1695365384/hive#quick-start"
            className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-amber-600"
          >
            {t('getStarted')}
          </a>
        </div>

        <button
          className="text-text-secondary md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="space-y-3 border-t border-border bg-surface px-6 py-4 md:hidden">
          <a
            href="https://github.com/1695365384/hive"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-text-secondary"
          >
            {t('github')}
          </a>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/"
              locale="en"
              className={locale === 'en' ? 'text-amber-500' : 'text-text-muted'}
            >
              EN
            </Link>
            <span className="text-text-muted">|</span>
            <Link
              href="/"
              locale="zh"
              className={locale === 'zh' ? 'text-amber-500' : 'text-text-muted'}
            >
              中文
            </Link>
          </div>
          <a
            href="https://github.com/1695365384/hive#quick-start"
            className="inline-block rounded bg-amber-500 px-4 py-2 text-sm font-medium text-black"
          >
            {t('getStarted')}
          </a>
        </div>
      )}
    </nav>
  );
}
