import { getTranslations } from 'next-intl/server';
import { getLatestRelease } from '@/lib/release';
import { TerminalInstall } from './terminal-install';
import { HexBackground } from './hex-background';

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
    <section className="relative overflow-hidden px-6 pb-16 pt-28 md:pt-36">
      <HexBackground />
      <div className="mx-auto max-w-3xl text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/5 px-3 py-1 text-xs font-medium tracking-wide text-amber-500/90 uppercase">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          {t('badge')}
        </div>

        {/* Title */}
        <h1 className="mb-5 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          {t('titleLine1')}
          <br />
          <span className="text-amber-500">{t('titleHighlight')}</span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mb-10 max-w-xl text-base leading-relaxed text-text-secondary md:text-lg">
          {t('subtitle')}
        </p>

        {/* Demo GIF */}
        <div className="mx-auto mb-10 max-w-2xl overflow-hidden rounded-xl border border-white/[0.08] bg-[#1c1c1e] shadow-2xl shadow-black/60">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-2 text-xs text-white/40">Hive</span>
          </div>
          <img
            src="/demo.gif"
            alt="Hive Desktop Demo"
            className="block w-full"
          />
        </div>

        {/* Install */}
        <TerminalInstall
          assets={assetsByPlatform}
          tagName={tagName}
          installCommand={t('installCommand')}
        />
      </div>
    </section>
  );
}
