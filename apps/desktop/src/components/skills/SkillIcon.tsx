import { useState } from "react";
import { Sparkles } from "lucide-react";

interface SkillIconProps {
  title: string;
  iconUrl?: string;
  className?: string;
}

/** SkillHub 图标；加载失败时用首字/火花占位 */
export function SkillIcon({ title, iconUrl, className = "" }: SkillIconProps) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(iconUrl) && !failed;
  const initial = (title || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className={`skill-icon ${className}`}
      aria-hidden
    >
      {showImg ? (
        <img
          src={iconUrl}
          alt=""
          className="skill-icon__img"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="skill-icon__fallback">
          {/[A-Za-z0-9]/.test(initial) ? (
            initial
          ) : (
            <Sparkles className="w-4 h-4 opacity-70" />
          )}
        </span>
      )}
    </div>
  );
}
