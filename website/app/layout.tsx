import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hive — Multi-Agent SDK for TypeScript',
  description:
    'Coordinator-Worker architecture with built-in cost control, permission layers, and 13 LLM providers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Analytics />
    </>
  );
}
