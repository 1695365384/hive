import { ReactNode } from 'react';
import { Header } from './Header';
import { ConfigPanel } from '../config/ConfigPanel';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />
      <main className="flex-1 overflow-hidden relative">
        {children}
        <ConfigPanel />
      </main>
    </div>
  );
}
