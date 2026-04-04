import { Nav } from '@/components/nav';
import { Hero } from '@/components/hero';
import { Providers } from '@/components/providers';
import { Features } from '@/components/features';
import { Architecture } from '@/components/architecture';
import { Screenshots } from '@/components/screenshots';
import { QuickStart } from '@/components/quick-start';
import { Footer } from '@/components/footer';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <>
      <Nav />
      <main className="pt-16">
        <Hero />
        <Providers />
        <Features />
        <Architecture />
        <Screenshots />
        <QuickStart />
      </main>
      <Footer />
    </>
  );
}
