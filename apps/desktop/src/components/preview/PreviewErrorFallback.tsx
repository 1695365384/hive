import { useTranslation } from "react-i18next";
import { ArtifactFileMenu } from "../chat/ArtifactFileMenu";

export type PreviewErrorFallbackProps = {
  title: string;
  name: string;
  path?: string;
  servedPath?: string;
  artifactSrc?: string;
  hint?: string;
};

export function PreviewErrorFallback({
  title,
  name,
  path,
  servedPath,
  artifactSrc,
  hint,
}: PreviewErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="preview-state preview-state--empty">
      <span className="text-sm text-stone-400">{t("preview.failed", { title })}</span>
      {hint && (
        <p className="text-xs text-stone-500 text-center max-w-[280px] leading-relaxed mt-1">{hint}</p>
      )}
      <p className="text-[11px] text-stone-500 text-center max-w-[300px] mt-2 leading-relaxed">
        {t("preview.fallbackHint")}
      </p>
      <ArtifactFileMenu
        name={name}
        path={path}
        servedPath={servedPath}
        src={artifactSrc}
        variant="panel"
        className="mt-3"
      />
    </div>
  );
}
