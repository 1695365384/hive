import { ChevronDown } from 'lucide-react';
import type { Provider } from '../../types';

interface ProviderSelectorProps {
  providers: Provider[];
  selectedProvider: string;
  onChange: (providerId: string) => void;
}

export function ProviderSelector({
  providers,
  selectedProvider,
  onChange,
}: ProviderSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">Provider</label>
      <div className="relative">
        <select
          value={selectedProvider}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer"
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      </div>
    </div>
  );
}
