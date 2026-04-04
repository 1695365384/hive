import { getTranslations } from 'next-intl/server';
import {
  Network,
  Cpu,
  DollarSign,
  Shield,
  Puzzle,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: 'coordinator', icon: Network },
  { key: 'providers', icon: Cpu },
  { key: 'cost', icon: DollarSign },
  { key: 'permissions', icon: Shield },
  { key: 'skills', icon: Puzzle },
  { key: 'monitoring', icon: Activity },
];

export async function Features() {
  const t = await getTranslations('features');

  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-2xl font-bold md:text-3xl">
          {t('title')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-text-secondary">
          {t('subtitle')}
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="rounded-xl border border-border p-6 transition-colors hover:border-border-light"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <Icon size={20} className="text-amber-500" />
              </div>
              <h3 className="mb-2 font-semibold">{t(`${key}.title`)}</h3>
              <p className="text-sm leading-relaxed text-text-secondary">
                {t(`${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
