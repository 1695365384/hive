import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

interface AskUserOption {
  label: string;
  description?: string;
}

interface AskUserCardProps {
  question: string;
  options: AskUserOption[];
  onAnswer: (answer: string) => void;
  onDismiss: () => void;
}

export function AskUserCard({ question, options, onAnswer, onDismiss }: AskUserCardProps) {
  const { t } = useTranslation();
  const [customInput, setCustomInput] = useState("");

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-xl bg-stone-900 border border-stone-800">
      {/* Close */}
      <div className="flex justify-end px-3 pt-2">
        <button
          onClick={onDismiss}
          className="p-0.5 text-stone-600 hover:text-stone-400"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Question */}
      <div className="px-4 pb-2">
        <p className="text-sm text-stone-100">{question}</p>
      </div>

      {/* Options */}
      {options.map((opt, i) => (
        <button
          key={i}
          onClick={() => onAnswer(opt.label)}
          className="w-full px-4 py-2 text-left text-sm text-stone-300 hover:text-stone-100 hover:bg-stone-800/50 flex items-center gap-2"
        >
          <span className="text-stone-600 text-xs font-mono w-4">{i + 1}</span>
          <span>{opt.label}</span>
          {opt.description && (
            <span className="text-stone-600 text-xs ml-auto hidden sm:block">{opt.description}</span>
          )}
        </button>
      ))}

      {/* Custom input */}
      <div className="border-t border-stone-800/50 px-4 py-2.5 flex items-center gap-2">
        <span className="text-stone-600 text-xs font-mono w-4">{options.length + 1}</span>
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customInput.trim()) onAnswer(customInput.trim());
          }}
          placeholder={t("askUser.otherPlaceholder")}
          className="flex-1 bg-transparent text-sm text-stone-200 placeholder-stone-600 outline-none"
          autoFocus
        />
      </div>
      </div>
    </div>
  );
}
