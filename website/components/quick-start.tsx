import { getTranslations } from 'next-intl/server';
import { codeToHtml } from 'shiki';
import { CopyButton } from './copy-button';

const STEPS = [
  { key: 'step1', hasCode: true },
  { key: 'step2', hasCode: false },
  { key: 'step3', hasCode: false },
];

export async function QuickStart() {
  const t = await getTranslations('quickStart');

  const code = t('step1.code');
  const html = await codeToHtml(code, {
    lang: 'bash',
    theme: 'github-dark',
  });

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
          {STEPS.map((step, i) => (
            <div key={step.key}>
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-xs font-bold text-amber-500">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{t(`${step.key}.title`)}</h3>
                  <p className="text-sm text-text-secondary">
                    {t(`${step.key}.description`)}
                  </p>
                </div>
              </div>
              {step.hasCode && (
                <div className="group relative rounded-xl border border-border overflow-hidden">
                  <div
                    className="text-sm [&>pre]:!rounded-none [&>pre]:!p-4 [&>pre]:!m-0"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                  <CopyButton code={code} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
