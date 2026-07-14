import { useCallback, useEffect, useRef, useState } from "react";
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
  const [entered, setEntered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const handlePick = useCallback(
    (answer: string) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      onAnswer(answer);
    },
    [onAnswer],
  );

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(focusTimer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) {
        e.preventDefault();
        handlePick(options[n - 1].label);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, onDismiss, handlePick]);

  const handleCustomSubmit = () => {
    const value = customInput.trim();
    if (!value) return;
    handlePick(value);
  };

  return (
    <div
      className={`ask-user ${entered ? "ask-user--entered" : ""} ${submitting ? "ask-user--leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-user-question"
    >
      <div className="ask-user__panel">
        <header className="ask-user__header">
          <div className="ask-user__eyebrow">
            <span className="ask-user__pulse" aria-hidden />
            <span>{t("askUser.title")}</span>
          </div>
          <button
            type="button"
            className="ask-user__close"
            onClick={onDismiss}
            aria-label={t("askUser.dismiss")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </header>

        <p id="ask-user-question" className="ask-user__question">
          {question}
        </p>

        {options.length > 0 && (
          <div className="ask-user__options" role="listbox" aria-label={t("askUser.options")}>
            {options.map((opt, i) => (
              <button
                key={`${opt.label}-${i}`}
                type="button"
                role="option"
                className="ask-user__option"
                style={{ animationDelay: `${60 + i * 40}ms` }}
                onClick={() => handlePick(opt.label)}
                disabled={submitting}
              >
                <span className="ask-user__index">{i + 1}</span>
                <span className="ask-user__option-body">
                  <span className="ask-user__option-label">{opt.label}</span>
                  {opt.description ? (
                    <span className="ask-user__option-desc">{opt.description}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="ask-user__custom">
          <span className="ask-user__index ask-user__index--muted">
            {options.length + 1}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCustomSubmit();
              }
            }}
            placeholder={t("askUser.otherPlaceholder")}
            className="ask-user__input"
            disabled={submitting}
          />
          <button
            type="button"
            className="ask-user__submit"
            onClick={handleCustomSubmit}
            disabled={submitting || !customInput.trim()}
          >
            {t("askUser.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
