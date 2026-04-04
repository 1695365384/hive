import { getTranslations } from 'next-intl/server';

export async function Footer() {
  const t = await getTranslations('footer');

  return (
    <footer className="border-t border-border py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h4 className="mb-4 text-sm font-semibold">{t('product.title')}</h4>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a
                  href="https://github.com/1695365384/hive/tree/main/packages/core"
                  className="transition-colors hover:text-text-primary"
                >
                  {t('product.core')}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/1695365384/hive/tree/main/apps/server"
                  className="transition-colors hover:text-text-primary"
                >
                  {t('product.server')}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/1695365384/hive/tree/main/apps/desktop"
                  className="transition-colors hover:text-text-primary"
                >
                  {t('product.desktop')}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/1695365384/hive/tree/main/packages/plugins"
                  className="transition-colors hover:text-text-primary"
                >
                  {t('product.plugins')}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold">
              {t('resources.title')}
            </h4>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a
                  href="https://github.com/1695365384/hive#readme"
                  className="transition-colors hover:text-text-primary"
                >
                  {t('resources.docs')}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/1695365384/hive"
                  className="transition-colors hover:text-text-primary"
                >
                  {t('resources.github')}
                </a>
              </li>
              <li>
                <a
                  href="https://www.npmjs.com/package/@bundy-lmw/hive-core"
                  className="transition-colors hover:text-text-primary"
                >
                  {t('resources.npm')}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold">
              {t('community.title')}
            </h4>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <a
                  href="https://github.com/1695365384/hive/issues"
                  className="transition-colors hover:text-text-primary"
                >
                  {t('community.issues')}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/1695365384/hive/blob/main/CONTRIBUTING.md"
                  className="transition-colors hover:text-text-primary"
                >
                  {t('community.contributing')}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-border pt-6 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Hive" className="h-5 w-5" />
            <span>Hive</span>
          </div>
          <span>{t('copyright')}</span>
        </div>
      </div>
    </footer>
  );
}
