import { getTranslations } from 'next-intl/server';

export async function Screenshots() {
  const t = await getTranslations('screenshots');

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-2xl font-bold md:text-3xl">
          {t('title')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-text-secondary">
          {t('subtitle')}
        </p>
        <div className="mt-10 overflow-hidden rounded-xl border border-border bg-surface-light">
          <img
            src="/desktop-screenshot.png"
            alt="Hive Desktop Application"
            className="w-full"
          />
        </div>
      </div>
    </section>
  );
}
