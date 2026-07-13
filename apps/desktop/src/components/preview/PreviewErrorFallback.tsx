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
  return (
    <div className="preview-state preview-state--empty">
      <span className="text-sm text-stone-400">无法预览 {title}</span>
      {hint && (
        <p className="text-xs text-stone-500 text-center max-w-[280px] leading-relaxed mt-1">{hint}</p>
      )}
      <p className="text-[11px] text-stone-500 text-center max-w-[300px] mt-2 leading-relaxed">
        可在应用内预览，或使用系统应用（如 Word、WPS）打开
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
