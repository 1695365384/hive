'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute right-3 top-3 cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-text-muted opacity-0 transition-all hover:text-text-secondary group-hover:opacity-100"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
