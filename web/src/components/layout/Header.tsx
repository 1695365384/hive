import { Settings, MessageSquare } from 'lucide-react';
import { useConfig } from '../../hooks/useConfig';

export function Header() {
  const { togglePanel } = useConfig();

  return (
    <header className="h-14 border-b border-gray-200 bg-white px-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-6 h-6 text-primary-600" />
        <h1 className="text-lg font-semibold text-gray-900">Claude Agent</h1>
      </div>

      <button
        onClick={togglePanel}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="打开设置"
      >
        <Settings className="w-5 h-5 text-gray-600" />
      </button>
    </header>
  );
}
