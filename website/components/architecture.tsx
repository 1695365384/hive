import { getTranslations } from 'next-intl/server';

export async function Architecture() {
  const t = await getTranslations('architecture');

  return (
    <section className="border-t border-border py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-2xl font-bold md:text-3xl">
          {t('title')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-text-secondary">
          {t('subtitle')}
        </p>
        <div className="mx-auto mt-10 max-w-4xl">
          <img
            src="/architecture.svg"
            alt="Hive System Architecture"
            className="w-full"
          />
        </div>
      </div>
    </section>
  );
}
