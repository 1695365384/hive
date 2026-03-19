import { ChevronDown } from 'lucide-react';
import type { Model } from '../../types';

interface ModelSelectorProps {
  models: Model[];
  selectedModel: string;
  onChange: (modelId: string) => void;
}

export function ModelSelector({
  models,
  selectedModel,
  onChange,
}: ModelSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">模型</label>
      <div className="relative">
        <select
          value={selectedModel}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer"
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      </div>
    </div>
  );
}
