import { getTranslations } from 'next-intl/server';

const STEPS = ['step1', 'step2', 'step3'];

export async function QuickStart() {
  const t = await getTranslations('quickStart');

  return (
    <section className="border-t border-border py-20">
      <div className="mx-auto max-w-4xl px-6">
        <h2 className="text-center text-2xl font-bold md:text-3xl">
          {t('title')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-text-secondary">
          {t('subtitle')}
        </p>

        <div className="mt-12 space-y-8">
          {STEPS.map((key, i) => (
            <div key={key} className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-sm font-bold text-amber-500">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{t(`${key}.title`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {t(`${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
