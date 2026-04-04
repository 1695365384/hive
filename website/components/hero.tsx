import { getTranslations } from 'next-intl/server';
import { getLatestRelease } from '@/lib/release';
import { TerminalInstall } from './terminal-install';

export async function Hero() {
  const t = await getTranslations('hero');
  const { tagName, assets } = await getLatestRelease();

  const assetsByPlatform: Record<'macos' | 'windows' | 'linux', { url?: string; name?: string }> = {
    macos: {},
    windows: {},
    linux: {},
  };

  for (const asset of assets) {
    assetsByPlatform[asset.platform] = { url: asset.url, name: asset.name };
  }

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
          <TerminalInstall
            assets={assetsByPlatform}
            tagName={tagName}
            installCommand={t('installCommand')}
          />
          <div className="mt-4 flex items-center justify-center">
            <a
              href="https://github.com/1695365384/hive#quick-start"
              className="rounded border border-border px-6 py-3 text-text-primary transition-colors hover:border-border-light"
            >
              {t('secondary')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
