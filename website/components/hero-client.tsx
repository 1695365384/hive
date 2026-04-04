'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface HeroClientProps {
  installCommand: string;
}

export function HeroClient({ installCommand }: HeroClientProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="inline-flex items-center gap-3 rounded border border-border bg-surface-light px-5 py-3 font-mono text-sm opacity-60">
      <span className="text-text-muted">$</span>
      <code>{installCommand}</code>
      <button
        onClick={handleCopy}
        className="ml-2 cursor-pointer rounded border border-border px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:border-border-light hover:text-text-secondary"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}
