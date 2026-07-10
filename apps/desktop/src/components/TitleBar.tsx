import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

export function TitleBar() {
  const window = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-8 bg-stone-900 border-b border-stone-800 select-none shrink-0"
    >
      {/* Title */}
      <div className="flex items-center gap-2 ml-3">
        <img src="/logo.svg" alt="Hive" className="w-4 h-4" />
        <span className="text-xs text-stone-400">Hive</span>
      </div>

      {/* Window controls */}
      <div className="flex h-full">
        <button
          onClick={() => window.minimize()}
          className="w-10 h-full flex items-center justify-center text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          onClick={() => window.toggleMaximize()}
          className="w-10 h-full flex items-center justify-center text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition-colors"
        >
          <Square className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={() => window.close()}
          className="w-10 h-full flex items-center justify-center text-stone-500 hover:text-stone-100 hover:bg-red-500 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
