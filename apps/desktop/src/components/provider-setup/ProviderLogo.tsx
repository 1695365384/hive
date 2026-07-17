import { getProviderBrand } from "./provider-brand";

type LogoSize = "sm" | "md" | "lg";

const SIZE: Record<
  LogoSize,
  { box: string; img: string; text: string; radius: string }
> = {
  sm: { box: "w-5 h-5", img: "w-3.5 h-3.5", text: "text-[9px]", radius: "rounded-md" },
  md: { box: "w-9 h-9", img: "w-6 h-6", text: "text-[11px]", radius: "rounded-lg" },
  lg: {
    box: "w-11 h-11",
    img: "w-7 h-7",
    text: "text-sm",
    radius: "rounded-xl",
  },
};

interface ProviderLogoProps {
  providerId: string;
  name: string;
  logo?: string;
  size?: LogoSize;
  className?: string;
}

/**
 * Brand-tinted light tile so models.dev currentColor (black) SVGs stay
 * readable on Hive's dark UI, and each vendor reads as a distinct color.
 */
export function ProviderLogo({
  providerId,
  name,
  logo,
  size = "md",
  className = "",
}: ProviderLogoProps) {
  const brand = getProviderBrand(providerId);
  const s = SIZE[size];
  const initials = (name || providerId).slice(0, 2);

  return (
    <div
      className={`${s.box} ${s.radius} flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(155deg, ${brand.tint} 0%, #fafaf9 72%)`,
        boxShadow: `inset 0 0 0 1px ${brand.accent}40, 0 1px 2px rgba(0,0,0,0.18)`,
      }}
      aria-hidden
    >
      {logo ? (
        <img src={logo} alt="" className={`${s.img} object-contain`} />
      ) : (
        <span
          className={`${s.text} font-semibold leading-none`}
          style={{ color: brand.accent }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
