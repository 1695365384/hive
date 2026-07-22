import { memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { playMotion } from "../../motion";

export type SkillChipProps = {
  name: string;
  description?: string;
};

function SkillChipInner({ name, description }: SkillChipProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playMotion("route-chip-enter", rootRef.current);
  }, [name]);

  const label = t("activity.skill.loaded", { name });

  return (
    <div
      ref={rootRef}
      className="route-chip route-chip--skill route-chip--anime"
      role="status"
      aria-label={label}
      title={description}
    >
      <span className="route-chip__mark" aria-hidden />
      <span className="route-chip__text">{label}</span>
    </div>
  );
}

export const SkillChip = memo(SkillChipInner);
