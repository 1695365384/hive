import { getTranslations } from 'next-intl/server';

const PROVIDERS = [
  { name: 'Claude', icon: '/icons/claude.png' },
  { name: 'GPT', icon: '/icons/openai.svg' },
  { name: 'Gemini', icon: '/icons/gemini.svg' },
  { name: 'GLM', icon: '/icons/glm.png' },
  { name: 'DeepSeek', icon: '/icons/deepseek.svg' },
  { name: 'Qwen', icon: '/icons/qwen.svg' },
  { name: 'Kimi', icon: '/icons/kimi.png' },
  { name: 'ERNIE', icon: '/icons/ernie.png', textIncluded: true },
  { name: 'OpenRouter', icon: '/icons/openrouter.svg' },
  { name: 'Groq', icon: '/icons/groq.svg' },
  { name: 'xAI', icon: '/icons/xai.svg' },
  { name: 'Mistral', icon: '/icons/mistral.png' },
  { name: 'LiteLLM', icon: null },
];

export async function Providers() {
  const t = await getTranslations('providers');

  return (
    <section className="border-t border-border py-16">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-2xl font-bold md:text-3xl">
          {t('title')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-text-secondary">
          {t('subtitle')}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4 sm:gap-x-8">
          {PROVIDERS.map(({ name, icon, textIncluded }) => (
            <div
              key={name}
              className="flex items-center gap-2 text-text-muted transition-colors hover:text-text-secondary"
            >
              {icon ? (
                <img
                  src={icon}
                  alt={name}
                  className={textIncluded ? 'h-5 w-auto opacity-70' : 'h-5 w-5 opacity-70'}
                  loading="lazy"
                />
              ) : (
                <span className="text-xs font-bold text-text-muted/50">LL</span>
              )}
              {!textIncluded && <span className="text-sm font-medium">{name}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
